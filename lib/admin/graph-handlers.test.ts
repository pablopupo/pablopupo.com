import { describe, expect, it, vi } from "vitest";

const nodeId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const edgeId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-07-27T14:30:00.000Z");

function request(method: string, body?: unknown, origin = "https://example.com") {
  return new Request("https://example.com/api/admin/graph", {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: vi.fn().mockResolvedValue({ status: "authorized", userId: "user-1" }),
    isSameOrigin: vi.fn().mockReturnValue(true),
    now: vi.fn().mockReturnValue(now),
    revalidate: vi.fn(),
    repository: {
      listGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [], suggestions: [] }),
      createConcept: vi.fn().mockResolvedValue({
        id: nodeId,
        key: "evaluation",
        label: "Evaluation",
        version: 1,
      }),
      updateNode: vi.fn().mockResolvedValue({ id: nodeId, version: 2 }),
      setNodeState: vi.fn().mockResolvedValue({ id: nodeId, version: 2 }),
      connectNodes: vi.fn().mockResolvedValue({ id: edgeId, version: 1 }),
      setEdgeState: vi.fn().mockResolvedValue({ id: edgeId, version: 2 }),
      decideSuggestion: vi.fn().mockResolvedValue({
        sourceId: nodeId,
        targetKey: "healthcare-ai",
        state: "public",
      }),
    },
    ...overrides,
  };
}

async function setupHandlers(overrides: Record<string, unknown> = {}) {
  const module = await import("./graph-handlers").catch(() => undefined);
  expect(module).toBeDefined();
  expect(module?.createAdminGraphHandlers).toBeTypeOf("function");
  const deps = dependencies(overrides);
  return { deps, handlers: module!.createAdminGraphHandlers(deps) };
}

describe("admin graph handler access", () => {
  it.each([
    ["unconfigured", 503],
    ["unauthenticated", 401],
    ["forbidden", 403],
  ])("maps %s access to %i", async (status, expectedStatus) => {
    const { handlers } = await setupHandlers({
      authorize: vi.fn().mockResolvedValue({ status }),
    });

    expect((await handlers.list(request("GET"))).status).toBe(expectedStatus);
  });

  it.each([
    [
      "concept creation",
      "createConcept",
      "POST",
      { label: "Evaluation", summary: "Measuring system behavior.", pinned: false },
    ],
    [
      "graph mutation",
      "mutate",
      "PATCH",
      {
        action: "updateNode",
        id: nodeId,
        expectedVersion: 1,
        node: {
          labelOverride: "Applied evaluation",
          summaryOverride: null,
          state: "public",
          pinned: false,
        },
      },
    ],
  ] as const)(
    "requires same-origin access for %s",
    async (_label, operation, method, body) => {
      const { deps, handlers } = await setupHandlers({
        isSameOrigin: vi.fn().mockReturnValue(false),
      });

      const response = await handlers[operation](
        request(method, body, "https://evil.example")
      );

      expect(response.status).toBe(403);
      expect(deps.repository.createConcept).not.toHaveBeenCalled();
      expect(deps.repository.updateNode).not.toHaveBeenCalled();
      expect(deps.repository.setNodeState).not.toHaveBeenCalled();
      expect(deps.repository.connectNodes).not.toHaveBeenCalled();
      expect(deps.repository.setEdgeState).not.toHaveBeenCalled();
      expect(deps.repository.decideSuggestion).not.toHaveBeenCalled();
    }
  );
});

describe("admin graph handler delegation", () => {
  it("lists the editable graph and computed suggestions", async () => {
    const graph = {
      nodes: [{ id: nodeId, label: "Applied AI" }],
      edges: [],
      suggestions: [{ sourceId: nodeId, targetKey: "evaluation" }],
    };
    const repository = {
      ...dependencies().repository,
      listGraph: vi.fn().mockResolvedValue(graph),
    };
    const { handlers } = await setupHandlers({ repository });

    const response = await handlers.list(request("GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ graph });
  });

  it("creates a concept from UI-friendly fields", async () => {
    const { deps, handlers } = await setupHandlers();
    const concept = {
      label: "Healthcare AI",
      summary: "Applied systems used in clinical workflows.",
      pinned: false,
    };

    const response = await handlers.createConcept(
      request("POST", concept)
    );

    expect(response.status).toBe(201);
    expect(deps.repository.createConcept).toHaveBeenCalledWith(concept, now);
    expect(deps.revalidate).toHaveBeenCalledOnce();
  });

  it("updates editable node fields with an optimistic version", async () => {
    const { deps, handlers } = await setupHandlers();
    const node = {
      labelOverride: "Applied AI systems",
      summaryOverride: "Projects and notes about deployed AI.",
      state: "public",
      pinned: true,
    };

    const response = await handlers.mutate(
      request("PATCH", {
        action: "updateNode",
        id: nodeId,
        expectedVersion: 3,
        node,
      })
    );

    expect(response.status).toBe(200);
    expect(deps.repository.updateNode).toHaveBeenCalledWith(
      nodeId,
      3,
      node,
      now
    );
    expect(deps.revalidate).toHaveBeenCalledOnce();
  });

  it("hides and restores persisted nodes without deleting them", async () => {
    const { deps, handlers } = await setupHandlers();

    const hidden = await handlers.mutate(
      request("PATCH", {
        action: "setNodeState",
        id: nodeId,
        expectedVersion: 1,
        state: "hidden",
      })
    );
    const restored = await handlers.mutate(
      request("PATCH", {
        action: "setNodeState",
        id: nodeId,
        expectedVersion: 2,
        state: "public",
      })
    );

    expect(hidden.status).toBe(200);
    expect(restored.status).toBe(200);
    expect(deps.repository.setNodeState).toHaveBeenNthCalledWith(
      1,
      nodeId,
      1,
      "hidden",
      now
    );
    expect(deps.repository.setNodeState).toHaveBeenNthCalledWith(
      2,
      nodeId,
      2,
      "public",
      now
    );
    expect(deps.revalidate).toHaveBeenCalledTimes(2);
  });

  it("connects distinct nodes with a validated relationship kind", async () => {
    const { deps, handlers } = await setupHandlers();

    const response = await handlers.mutate(
      request("PATCH", {
        action: "connectNodes",
        sourceId: nodeId,
        targetId,
        kind: "semantic",
      })
    );

    expect(response.status).toBe(201);
    expect(deps.repository.connectNodes).toHaveBeenCalledWith(
      nodeId,
      targetId,
      "semantic",
      now
    );
    expect(deps.revalidate).toHaveBeenCalledOnce();
  });

  it("hides and restores persisted edges without deleting them", async () => {
    const { deps, handlers } = await setupHandlers();

    const hidden = await handlers.mutate(
      request("PATCH", {
        action: "setEdgeState",
        id: edgeId,
        expectedVersion: 1,
        state: "hidden",
      })
    );
    const restored = await handlers.mutate(
      request("PATCH", {
        action: "setEdgeState",
        id: edgeId,
        expectedVersion: 2,
        state: "public",
      })
    );

    expect(hidden.status).toBe(200);
    expect(restored.status).toBe(200);
    expect(deps.repository.setEdgeState).toHaveBeenNthCalledWith(
      1,
      edgeId,
      1,
      "hidden",
      now
    );
    expect(deps.repository.setEdgeState).toHaveBeenNthCalledWith(
      2,
      edgeId,
      2,
      "public",
      now
    );
  });

  it.each([
    ["accepts", "public"],
    ["ignores", "hidden"],
  ] as const)("%s a computed suggestion by stable keys", async (_label, state) => {
    const { deps, handlers } = await setupHandlers();
    const suggestion = {
      sourceId: nodeId,
      targetKey: "healthcare-ai",
      targetLabel: "Healthcare AI",
      state,
    };

    const response = await handlers.mutate(
      request("PATCH", {
        action: "decideSuggestion",
        suggestion,
      })
    );

    expect(response.status).toBe(200);
    expect(deps.repository.decideSuggestion).toHaveBeenCalledWith(
      suggestion,
      now
    );
    expect(deps.revalidate).toHaveBeenCalledOnce();
  });
});

describe("admin graph handler validation and errors", () => {
  it.each([
    [
      {
        action: "updateNode",
        id: "not-a-uuid",
        expectedVersion: 0,
        node: {
          labelOverride: null,
          summaryOverride: null,
          state: "public",
          pinned: false,
        },
      },
    ],
    [
      {
        action: "setNodeState",
        id: nodeId,
        expectedVersion: 0,
        state: "suggested",
      },
    ],
    [
      {
        action: "connectNodes",
        sourceId: nodeId,
        targetId: nodeId,
        kind: "semantic",
      },
    ],
    [
      {
        action: "decideSuggestion",
        suggestion: {
          sourceId: nodeId,
          targetKey: "",
          targetLabel: "",
          state: "suggested",
        },
      },
    ],
    [{ action: "unknown" }],
  ])("rejects malformed mutations before persistence", async (body) => {
    const { deps, handlers } = await setupHandlers();

    const response = await handlers.mutate(request("PATCH", body));

    expect(response.status).toBe(422);
    expect(deps.repository.updateNode).not.toHaveBeenCalled();
    expect(deps.repository.setNodeState).not.toHaveBeenCalled();
    expect(deps.repository.connectNodes).not.toHaveBeenCalled();
    expect(deps.repository.setEdgeState).not.toHaveBeenCalled();
    expect(deps.repository.decideSuggestion).not.toHaveBeenCalled();
  });

  it("rejects an empty concept before deriving a key", async () => {
    const { deps, handlers } = await setupHandlers();

    const response = await handlers.createConcept(
      request("POST", { label: " ", summary: "", pinned: false })
    );

    expect(response.status).toBe(422);
    expect(deps.repository.createConcept).not.toHaveBeenCalled();
  });

  it("maps an optimistic graph conflict to 409", async () => {
    const repositoryModule = await import("./graph-repository").catch(
      () => undefined
    );
    expect(repositoryModule?.GraphConflictError).toBeTypeOf("function");
    const repository = {
      ...dependencies().repository,
      updateNode: vi
        .fn()
        .mockRejectedValue(
          new repositoryModule!.GraphConflictError("Graph node changed")
        ),
    };
    const { handlers } = await setupHandlers({ repository });

    const response = await handlers.mutate(
      request("PATCH", {
        action: "updateNode",
        id: nodeId,
        expectedVersion: 1,
        node: {
          labelOverride: null,
          summaryOverride: null,
          state: "hidden",
          pinned: false,
        },
      })
    );

    expect(response.status).toBe(409);
    expect(repository.updateNode).toHaveBeenCalledOnce();
  });

  it("maps a stale node state transition to 409", async () => {
    const repositoryModule = await import("./graph-repository").catch(
      () => undefined
    );
    expect(repositoryModule?.GraphConflictError).toBeTypeOf("function");
    const repository = {
      ...dependencies().repository,
      setNodeState: vi
        .fn()
        .mockRejectedValue(
          new repositoryModule!.GraphConflictError("Graph node changed")
        ),
    };
    const { handlers } = await setupHandlers({ repository });

    const response = await handlers.mutate(
      request("PATCH", {
        action: "setNodeState",
        id: nodeId,
        expectedVersion: 1,
        state: "hidden",
      })
    );

    expect(response.status).toBe(409);
    expect(repository.setNodeState).toHaveBeenCalledOnce();
  });
});
