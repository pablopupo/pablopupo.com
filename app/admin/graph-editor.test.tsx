// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import GraphEditor, {
  activeGraphMapData,
  canRestoreGraphEdge,
  createGraphConcept,
  graphRestoreMutation,
  mutateGraph,
  removedGraphItems,
} from "./graph-editor";

vi.mock("@/components/graph-map", () => ({
  default: ({
    data,
    onSelect,
  }: {
    data: { nodes: Array<{ id: string; label: string }> };
    onSelect: (id: string) => void;
  }) => (
    <div aria-label="Editable knowledge map">
      {data.nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          data-graph-node={node.id}
          onClick={() => onSelect(node.id)}
        >
          {node.label}
        </button>
      ))}
    </div>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = null;
  container = null;
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const graph = {
  nodes: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      key: "healthcare-ai",
      projectId: null,
      entryId: null,
      label: "Healthcare AI",
      labelOverride: null,
      displayLabel: "Healthcare AI",
      kind: "concept" as const,
      href: null,
      body: "Clinical software systems.",
      summaryOverride: null,
      displaySummary: "Clinical software systems.",
      origin: "manual" as const,
      state: "public" as const,
      pinned: true,
      version: 1,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      key: "project:gradus",
      projectId: "33333333-3333-4333-8333-333333333333",
      entryId: null,
      label: "Gradus ad Parnassum",
      labelOverride: null,
      displayLabel: "Gradus ad Parnassum",
      kind: "project" as const,
      href: "/work#gradus-ad-parnassum",
      body: "Retrieval over musical notation.",
      summaryOverride: null,
      displaySummary: "Retrieval over musical notation.",
      origin: "automatic" as const,
      state: "hidden" as const,
      pinned: false,
      version: 4,
    },
  ],
  edges: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      sourceId: "11111111-1111-4111-8111-111111111111",
      targetId: "22222222-2222-4222-8222-222222222222",
      kind: "semantic" as const,
      origin: "manual" as const,
      state: "public" as const,
      version: 2,
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      sourceId: "22222222-2222-4222-8222-222222222222",
      targetId: "11111111-1111-4111-8111-111111111111",
      kind: "link" as const,
      origin: "manual" as const,
      state: "hidden" as const,
      version: 3,
    },
  ],
  suggestions: [],
};

function graphResponse(value: typeof graph) {
  return jsonResponse({ graph: value });
}

function statefulGraphFetcher(initial: typeof graph) {
  let current = structuredClone(initial);
  const mutations: Array<Record<string, unknown>> = [];
  const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return graphResponse(current);
    const mutation = JSON.parse(String(init.body)) as Record<string, unknown>;
    mutations.push(mutation);
    if (mutation.action === "setNodeState") {
      const node = current.nodes.find((candidate) => candidate.id === mutation.id);
      if (!node) return jsonResponse({ error: "graph item not found" }, 404);
      node.state = mutation.state as "public" | "hidden";
      node.version += 1;
      return jsonResponse({ node });
    }
    if (mutation.action === "setEdgeState") {
      const edge = current.edges.find((candidate) => candidate.id === mutation.id);
      if (!edge) return jsonResponse({ error: "graph item not found" }, 404);
      edge.state = mutation.state as "public" | "hidden";
      edge.version += 1;
      return jsonResponse({ edge });
    }
    return jsonResponse({ error: "unexpected mutation" }, 422);
  });
  return { fetcher, mutations };
}

async function mountGraphEditor(fetcher: typeof fetch) {
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<GraphEditor />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

function buttonByText(element: ParentNode, label: string) {
  const button = [...element.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!button) throw new Error(`Missing button ${label}`);
  return button;
}

describe("graph editor requests", () => {
  it("creates a concept from fields shown in the side inspector", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ node: { id: "concept-id" } }, 201));

    await createGraphConcept(
      {
        label: "Healthcare AI",
        summary: "Applied systems used in clinical workflows.",
        pinned: false,
      },
      fetcher
    );

    expect(fetcher).toHaveBeenCalledWith("/api/admin/graph", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Healthcare AI",
        summary: "Applied systems used in clinical workflows.",
        pinned: false,
      }),
    });
  });

  it("uses one PATCH contract for node, connection, and suggestion decisions", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({}));
    const mutation = {
      action: "connectNodes" as const,
      sourceId: "00000000-0000-4000-8000-000000000001",
      targetId: "00000000-0000-4000-8000-000000000002",
      kind: "semantic" as const,
    };

    await mutateGraph(mutation, fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/admin/graph", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mutation),
    });
  });

  it("sends a versioned node-state mutation without unrelated form fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        node: {
          id: graph.nodes[0].id,
          state: "hidden",
          version: 2,
        },
      })
    );
    const mutation = {
      action: "setNodeState" as const,
      id: graph.nodes[0].id,
      expectedVersion: 1,
      state: "hidden" as const,
    };

    await mutateGraph(mutation, fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/admin/graph", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mutation),
    });
  });
});

describe("graph editor removal state", () => {
  it("keeps hidden items out of the active map without dropping stored relationships", () => {
    expect(activeGraphMapData(graph)).toEqual({
      nodes: [
        {
          id: graph.nodes[0].id,
          label: "Healthcare AI",
          type: "concept",
          summary: "Clinical software systems.",
          href: null,
          pinned: true,
        },
      ],
      edges: [],
    });
    expect(graph.edges).toHaveLength(2);
  });

  it("keeps removed nodes and connections available for later restoration", () => {
    expect(removedGraphItems(graph)).toEqual({
      nodes: [graph.nodes[1]],
      edges: [graph.edges[1]],
    });
  });

  it("does not present ignored suggestion edges as manually removed content", () => {
    const suggestedNode = {
      ...graph.nodes[0],
      id: "66666666-6666-4666-8666-666666666666",
      key: "suggested:inference",
      label: "Inference",
      displayLabel: "Inference",
      origin: "automatic" as const,
      state: "suggested" as const,
      version: 1,
    };
    const ignoredSuggestionEdge = {
      ...graph.edges[0],
      id: "77777777-7777-4777-8777-777777777777",
      targetId: suggestedNode.id,
      origin: "automatic" as const,
      state: "hidden" as const,
      version: 1,
    };
    const graphWithIgnoredSuggestion = {
      ...graph,
      nodes: [...graph.nodes, suggestedNode],
      edges: [...graph.edges, ignoredSuggestionEdge],
    };

    expect(removedGraphItems(graphWithIgnoredSuggestion).edges).toEqual([
      graph.edges[1],
    ]);
  });

  it("only restores a connection when both endpoint nodes are public", () => {
    expect(canRestoreGraphEdge(graph, graph.edges[1])).toBe(false);

    const activeGraph = structuredClone(graph);
    activeGraph.nodes[1].state = "public";

    expect(canRestoreGraphEdge(activeGraph, activeGraph.edges[1])).toBe(true);
  });

  it("restores a removed item from its latest persisted version", () => {
    expect(graphRestoreMutation("node", graph.nodes[1])).toEqual({
      action: "setNodeState",
      id: graph.nodes[1].id,
      expectedVersion: 4,
      state: "public",
    });
    expect(graphRestoreMutation("edge", graph.edges[1])).toEqual({
      action: "setEdgeState",
      id: graph.edges[1].id,
      expectedVersion: 3,
      state: "public",
    });
  });

  it("restores a removed node from the persistent Removed view", async () => {
    const { fetcher, mutations } = statefulGraphFetcher(graph);
    const mounted = await mountGraphEditor(fetcher as typeof fetch);

    act(() => buttonByText(mounted, "Removed (2)").click());
    const removedNode = [...mounted.querySelectorAll("li")].find((item) =>
      item.textContent?.includes("Gradus ad Parnassum")
    );
    if (!removedNode) throw new Error("Missing removed node");
    const blockedConnection = [...mounted.querySelectorAll("li")].find(
      (item) => item.textContent?.includes("Gradus ad Parnassum → Healthcare AI")
    );
    if (!blockedConnection) throw new Error("Missing removed connection");
    expect(
      buttonByText(blockedConnection, "Restore nodes first").disabled
    ).toBe(true);
    await act(async () => buttonByText(removedNode, "Restore").click());

    expect(mutations).toContainEqual({
      action: "setNodeState",
      id: graph.nodes[1].id,
      expectedVersion: 4,
      state: "public",
    });
    expect(
      mounted.querySelector(`[data-graph-node="${graph.nodes[1].id}"]`)
    ).not.toBeNull();
    const restorableConnection = [...mounted.querySelectorAll("li")].find(
      (item) => item.textContent?.includes("Gradus ad Parnassum → Healthcare AI")
    );
    if (!restorableConnection) throw new Error("Missing restorable connection");
    expect(buttonByText(restorableConnection, "Restore").disabled).toBe(false);
  });

  it("removes a selected concept and immediately undoes with the returned version", async () => {
    const activeGraph = structuredClone(graph);
    activeGraph.nodes[1].state = "public";
    const { fetcher, mutations } = statefulGraphFetcher(activeGraph);
    const mounted = await mountGraphEditor(fetcher as typeof fetch);

    expect(mounted.textContent).toContain("Select a node");
    act(() => {
      mounted
        .querySelector<HTMLButtonElement>(
          `[data-graph-node="${graph.nodes[0].id}"]`
        )
        ?.click();
    });
    expect(mounted.textContent).not.toContain("Visibility");
    act(() => buttonByText(mounted, "Remove concept").click());
    const confirmation = mounted.querySelector(".graph-admin-remove-confirmation");
    if (!confirmation) throw new Error("Missing removal confirmation");
    await act(async () => buttonByText(confirmation, "Remove concept").click());

    expect(mutations[0]).toEqual({
      action: "setNodeState",
      id: graph.nodes[0].id,
      expectedVersion: 1,
      state: "hidden",
    });
    expect(mounted.textContent).toContain("Healthcare AI removed");
    expect(
      mounted.querySelector(`[data-graph-node="${graph.nodes[0].id}"]`)
    ).toBeNull();
    expect(mounted.textContent).toContain("Select a node");

    await act(async () => buttonByText(mounted, "Undo").click());

    expect(mutations[1]).toEqual({
      action: "setNodeState",
      id: graph.nodes[0].id,
      expectedVersion: 2,
      state: "public",
    });
    expect(
      mounted.querySelector(`[data-graph-node="${graph.nodes[0].id}"]`)
    ).not.toBeNull();
  });

  it("removes a connection and immediately undoes with the returned version", async () => {
    const activeGraph = structuredClone(graph);
    activeGraph.nodes[1].state = "public";
    const { fetcher, mutations } = statefulGraphFetcher(activeGraph);
    const mounted = await mountGraphEditor(fetcher as typeof fetch);

    act(() => {
      mounted
        .querySelector<HTMLButtonElement>(
          `[data-graph-node="${graph.nodes[0].id}"]`
        )
        ?.click();
    });
    act(() => buttonByText(mounted, "Connections").click());
    const connection = [...mounted.querySelectorAll("li")].find(
      (item) =>
        item.textContent?.includes("Gradus ad Parnassum") &&
        item.textContent.includes("semantic")
    );
    if (!connection) throw new Error("Missing active connection");
    act(() => buttonByText(connection, "Remove connection").click());
    const confirmation = connection.querySelector(
      ".graph-admin-remove-confirmation"
    );
    if (!confirmation) throw new Error("Missing connection confirmation");
    await act(async () =>
      buttonByText(confirmation, "Remove connection").click()
    );

    expect(mutations[0]).toEqual({
      action: "setEdgeState",
      id: graph.edges[0].id,
      expectedVersion: 2,
      state: "hidden",
    });
    expect(mounted.textContent).toContain(
      "Healthcare AI → Gradus ad Parnassum removed"
    );

    await act(async () => buttonByText(mounted, "Undo").click());

    expect(mutations[1]).toEqual({
      action: "setEdgeState",
      id: graph.edges[0].id,
      expectedVersion: 3,
      state: "public",
    });
  });

  it("moves focus into removal confirmation and returns it on cancel", async () => {
    const { fetcher } = statefulGraphFetcher(graph);
    const mounted = await mountGraphEditor(fetcher as typeof fetch);

    act(() => {
      mounted
        .querySelector<HTMLButtonElement>(
          `[data-graph-node="${graph.nodes[0].id}"]`
        )
        ?.click();
    });
    const trigger = buttonByText(mounted, "Remove concept");
    trigger.focus();
    act(() => trigger.click());
    const confirmation = mounted.querySelector<HTMLElement>(
      ".graph-admin-remove-confirmation"
    );
    if (!confirmation) throw new Error("Missing removal confirmation");

    expect(confirmation.getAttribute("role")).toBe("alertdialog");
    expect(document.activeElement).toBe(confirmation);

    act(() => buttonByText(confirmation, "Cancel").click());

    expect(document.activeElement).toBe(trigger);
  });

  it("reloads the latest node version after a mutation conflict", async () => {
    const current = structuredClone(graph);
    const mutations: Array<Record<string, unknown>> = [];
    let conflict = true;
    const fetcher = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (!init?.method || init.method === "GET") return graphResponse(current);
        const mutation = JSON.parse(String(init.body)) as Record<string, unknown>;
        mutations.push(mutation);
        if (conflict) {
          conflict = false;
          current.nodes[0].version = 2;
          return jsonResponse({ error: "graph changed in another session" }, 409);
        }
        current.nodes[0].state = "hidden";
        current.nodes[0].version = 3;
        return jsonResponse({ node: current.nodes[0] });
      }
    );
    const mounted = await mountGraphEditor(fetcher as typeof fetch);

    act(() => {
      mounted
        .querySelector<HTMLButtonElement>(
          `[data-graph-node="${graph.nodes[0].id}"]`
        )
        ?.click();
    });
    act(() => buttonByText(mounted, "Remove concept").click());
    const confirmation = mounted.querySelector(
      ".graph-admin-remove-confirmation"
    );
    if (!confirmation) throw new Error("Missing removal confirmation");
    await act(async () => buttonByText(confirmation, "Remove concept").click());

    expect(mounted.textContent).toContain(
      "Graph changed in another session. Latest version loaded."
    );
    const retryConfirmation = mounted.querySelector(
      ".graph-admin-remove-confirmation"
    );
    if (!retryConfirmation) throw new Error("Missing retry confirmation");
    await act(async () =>
      buttonByText(retryConfirmation, "Remove concept").click()
    );

    expect(mutations.map((mutation) => mutation.expectedVersion)).toEqual([1, 2]);
  });
});

describe("graph editor UI", () => {
  it("keeps the workspace and editable inspector side by side", () => {
    const html = renderToStaticMarkup(<GraphEditor />);

    for (const label of [
      "Graph",
      "Add concept",
      "Connect",
      "Suggestions",
      "Removed",
      "Preview public",
      "Select a node",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('class="graph-admin-workspace"');
    expect(html).toContain('class="graph-admin-inspector"');
  });
});
