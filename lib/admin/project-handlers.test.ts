import { describe, expect, it, vi } from "vitest";
import {
  ProjectConflictError,
  ProjectNotFoundError,
} from "./project-repository";

const projectId = "11111111-1111-4111-8111-111111111111";
const updatedAt = "2026-07-22T12:00:00.000Z";

function request(method: string, body?: unknown, origin = "https://example.com") {
  return new Request("https://example.com/api/admin/projects", {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    slug: "runtime-lab",
    kind: "project",
    status: "draft",
    title: "Runtime lab",
    organization: null,
    summary: "Experiments in model serving.",
    bodyMarkdown: "## Notes",
    startedOn: null,
    endedOn: null,
    publishedAt: null,
    sortOrder: 0,
    featured: false,
    technologies: ["Python"],
    links: [
      {
        kind: "repository",
        label: "Repository",
        url: "https://github.com/pablopupo/runtime-lab",
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: vi.fn().mockResolvedValue({ status: "authorized", userId: "user-1" }),
    isSameOrigin: vi.fn().mockReturnValue(true),
    now: vi.fn().mockReturnValue(new Date("2026-07-22T12:30:00Z")),
    revalidate: vi.fn(),
    repository: {
      listProjects: vi.fn().mockResolvedValue([]),
      createDraft: vi.fn().mockResolvedValue({
        id: projectId,
        ...draft(),
        updatedAt,
      }),
      getProject: vi.fn().mockResolvedValue({
        id: projectId,
        ...draft(),
        updatedAt,
      }),
      updateProject: vi.fn().mockResolvedValue({
        id: projectId,
        ...draft(),
        updatedAt: "2026-07-22T12:30:00.000Z",
      }),
      deleteProject: vi.fn().mockResolvedValue(true),
    },
    ...overrides,
  };
}

async function setupHandlers(overrides: Record<string, unknown> = {}) {
  const module = await import("./project-handlers").catch(() => undefined);
  expect(module).toBeDefined();
  expect(module?.createAdminProjectHandlers).toBeTypeOf("function");
  const deps = dependencies(overrides);
  return { deps, handlers: module!.createAdminProjectHandlers(deps) };
}

describe("admin project handler authorization", () => {
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
    ["create", "POST"],
    ["update", "PATCH"],
    ["remove", "DELETE"],
  ] as const)("requires same-origin access for %s", async (operation, method) => {
    const { deps, handlers } = await setupHandlers({
      isSameOrigin: vi.fn().mockReturnValue(false),
    });
    const response =
      operation === "create"
        ? await handlers.create(request(method, draft(), "https://evil.example"))
        : operation === "update"
          ? await handlers.update(
              request(
                method,
                { expectedUpdatedAt: updatedAt, project: draft() },
                "https://evil.example"
              ),
              projectId
            )
          : await handlers.remove(
              request(
                method,
                { expectedUpdatedAt: updatedAt, confirmation: "runtime-lab" },
                "https://evil.example"
              ),
              projectId
            );

    expect(response.status).toBe(403);
    expect(deps.repository.createDraft).not.toHaveBeenCalled();
    expect(deps.repository.updateProject).not.toHaveBeenCalled();
    expect(deps.repository.deleteProject).not.toHaveBeenCalled();
  });
});

describe("admin project handler validation and persistence", () => {
  it("creates projects as drafts only", async () => {
    const { deps, handlers } = await setupHandlers();

    const response = await handlers.create(request("POST", draft()));

    expect(response.status).toBe(201);
    expect(deps.repository.createDraft).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
      new Date("2026-07-22T12:30:00Z")
    );
    expect(deps.revalidate).toHaveBeenCalledOnce();

    const published = await handlers.create(
      request(
        "POST",
        draft({ status: "published", publishedAt: "2026-07-22T12:00:00Z" })
      )
    );
    expect(published.status).toBe(422);
    expect(deps.repository.createDraft).toHaveBeenCalledOnce();
  });

  it.each([
    ["javascript:alert(1)", "non-HTTP protocol"],
    ["https://user:secret@example.com/project", "embedded credentials"],
  ])("rejects %s project links as %s", async (url) => {
    const { deps, handlers } = await setupHandlers();

    const response = await handlers.create(
      request(
        "POST",
        draft({
          links: [
            { kind: "live", label: "Unsafe", url, sortOrder: 0 },
          ],
        })
      )
    );

    expect(response.status).toBe(422);
    expect(deps.repository.createDraft).not.toHaveBeenCalled();
  });

  it("loads, updates, schedules, and publishes with an updatedAt token", async () => {
    const { deps, handlers } = await setupHandlers();

    expect((await handlers.list(request("GET"))).status).toBe(200);
    expect((await handlers.load(request("GET"), projectId)).status).toBe(200);

    const scheduled = draft({
      status: "scheduled",
      publishedAt: "2030-08-01T16:00:00Z",
    });
    expect(
      (
        await handlers.update(
          request("PATCH", { expectedUpdatedAt: updatedAt, project: scheduled }),
          projectId
        )
      ).status
    ).toBe(200);
    expect(deps.repository.updateProject).toHaveBeenCalledWith(
      projectId,
      new Date(updatedAt),
      expect.objectContaining({
        status: "scheduled",
        publishedAt: new Date("2030-08-01T16:00:00Z"),
      }),
      new Date("2026-07-22T12:30:00Z")
    );

    expect(
      (
        await handlers.update(
          request("PATCH", {
            expectedUpdatedAt: updatedAt,
            project: draft({
              status: "published",
              publishedAt: "2026-07-22T12:00:00Z",
            }),
          }),
          projectId
        )
      ).status
    ).toBe(200);
    expect(deps.revalidate).toHaveBeenCalledTimes(2);
  });

  it("normalizes a due scheduled project to published when it is edited", async () => {
    const dueProject = {
      id: projectId,
      ...draft({
        status: "scheduled",
        publishedAt: new Date("2026-07-22T12:00:00Z"),
      }),
      updatedAt,
    };
    const { deps, handlers } = await setupHandlers({
      repository: {
        ...dependencies().repository,
        getProject: vi.fn().mockResolvedValue(dueProject),
      },
    });

    const response = await handlers.update(
      request("PATCH", {
        expectedUpdatedAt: updatedAt,
        project: draft({
          status: "scheduled",
          publishedAt: "2026-07-22T12:00:00Z",
          title: "Runtime lab, revised",
        }),
      }),
      projectId
    );

    expect(response.status).toBe(200);
    expect(deps.repository.updateProject).toHaveBeenCalledWith(
      projectId,
      new Date(updatedAt),
      expect.objectContaining({
        status: "published",
        publishedAt: new Date("2026-07-22T12:00:00Z"),
        title: "Runtime lab, revised",
      }),
      new Date("2026-07-22T12:30:00Z")
    );
  });

  it("does not turn a backdated transition into an immediate publication", async () => {
    const archivedProject = {
      id: projectId,
      ...draft({
        status: "archived",
        publishedAt: new Date("2026-07-01T12:00:00Z"),
      }),
      updatedAt,
    };
    const repository = {
      ...dependencies().repository,
      getProject: vi.fn().mockResolvedValue(archivedProject),
    };
    const { handlers } = await setupHandlers({ repository });

    const response = await handlers.update(
      request("PATCH", {
        expectedUpdatedAt: updatedAt,
        project: draft({
          status: "scheduled",
          publishedAt: "2026-07-01T12:00:00Z",
        }),
      }),
      projectId
    );

    expect(response.status).toBe(422);
    expect(repository.updateProject).not.toHaveBeenCalled();
  });

  it("maps stale updates and missing projects without hiding the distinction", async () => {
    const conflict = dependencies();
    conflict.repository.updateProject.mockRejectedValue(
      new ProjectConflictError("Project changed in another session")
    );
    const module = await import("./project-handlers");
    const conflictHandlers = module.createAdminProjectHandlers(conflict);

    const conflictResponse = await conflictHandlers.update(
      request("PATCH", { expectedUpdatedAt: updatedAt, project: draft() }),
      projectId
    );
    expect(conflictResponse.status).toBe(409);

    const missing = dependencies();
    missing.repository.getProject.mockResolvedValue(undefined);
    missing.repository.deleteProject.mockRejectedValue(
      new ProjectNotFoundError("Project not found")
    );
    const missingHandlers = module.createAdminProjectHandlers(missing);
    expect((await missingHandlers.load(request("GET"), projectId)).status).toBe(404);
  });

  it("requires the current slug and updatedAt token for deletion", async () => {
    const { deps, handlers } = await setupHandlers();

    expect(
      (
        await handlers.remove(
          request("DELETE", {
            expectedUpdatedAt: updatedAt,
            confirmation: "wrong-slug",
          }),
          projectId
        )
      ).status
    ).toBe(422);
    expect(deps.repository.deleteProject).not.toHaveBeenCalled();

    expect(
      (
        await handlers.remove(
          request("DELETE", {
            expectedUpdatedAt: updatedAt,
            confirmation: "runtime-lab",
          }),
          projectId
        )
      ).status
    ).toBe(204);
    expect(deps.repository.deleteProject).toHaveBeenCalledWith(
      projectId,
      new Date(updatedAt)
    );
    expect(deps.revalidate).toHaveBeenCalledOnce();
  });

  it("rejects malformed project IDs before querying the repository", async () => {
    const { deps, handlers } = await setupHandlers();

    const response = await handlers.load(request("GET"), "not-a-uuid");

    expect(response.status).toBe(422);
    expect(deps.repository.getProject).not.toHaveBeenCalled();
  });
});
