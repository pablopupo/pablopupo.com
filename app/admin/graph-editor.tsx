"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import GraphMap, {
  type GraphMapData,
  type GraphMapNodeType,
} from "@/components/graph-map";
import { AdminShell } from "./admin-shell";

type GraphState = "suggested" | "public" | "hidden";
type GraphOrigin = "automatic" | "manual";
type GraphEdgeKind = "tag" | "link" | "semantic";

type AdminGraphNode = {
  id: string;
  key: string;
  projectId: string | null;
  entryId: string | null;
  label: string;
  labelOverride: string | null;
  displayLabel: string;
  kind: GraphMapNodeType;
  href: string | null;
  body: string;
  summaryOverride: string | null;
  displaySummary: string;
  origin: GraphOrigin;
  state: GraphState;
  pinned: boolean;
  version: number;
};

type AdminGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: GraphEdgeKind;
  origin: GraphOrigin;
  state: GraphState;
  version: number;
};

type AdminGraphSuggestion = {
  id: string;
  sourceId: string;
  targetId: string | null;
  targetKey: string;
  targetLabel: string;
  evidence: string;
};

type AdminGraph = {
  nodes: AdminGraphNode[];
  edges: AdminGraphEdge[];
  suggestions: AdminGraphSuggestion[];
};

type ConceptInput = {
  label: string;
  summary: string | null;
  pinned: boolean;
};

type UndoAction = {
  kind: "node" | "edge";
  id: string;
  label: string;
  expectedVersion: number;
};

type GraphMutation =
  | {
      action: "updateNode";
      id: string;
      expectedVersion: number;
      node: {
        labelOverride: string | null;
        summaryOverride: string | null;
        state: "public" | "hidden";
        pinned: boolean;
      };
    }
  | {
      action: "setNodeState";
      id: string;
      expectedVersion: number;
      state: "public" | "hidden";
    }
  | {
      action: "connectNodes";
      sourceId: string;
      targetId: string;
      kind: GraphEdgeKind;
    }
  | {
      action: "setEdgeState";
      id: string;
      expectedVersion: number;
      state: "public" | "hidden";
    }
  | {
      action: "decideSuggestion";
      suggestion: {
        sourceId: string;
        targetKey: string;
        targetLabel: string;
        state: "public" | "hidden";
      };
    };

const emptyGraph: AdminGraph = { nodes: [], edges: [], suggestions: [] };

class GraphMutationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GraphMutationError";
  }
}

async function payload(response: Response) {
  return response.json().catch(() => null) as Promise<{
    error?: string;
    graph?: AdminGraph;
    node?: { id?: string; version?: number };
    edge?: { id?: string; version?: number };
  } | null>;
}

export async function loadAdminGraph(fetcher: typeof fetch = fetch) {
  const response = await fetcher("/api/admin/graph", { cache: "no-store" });
  const body = await payload(response);
  if (!response.ok || !body?.graph) {
    throw new Error(body?.error ?? `Could not load graph (${response.status})`);
  }
  return body.graph;
}

export async function createGraphConcept(
  concept: ConceptInput,
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher("/api/admin/graph", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(concept),
  });
  const body = await payload(response);
  if (!response.ok) {
    throw new Error(body?.error ?? `Could not create concept (${response.status})`);
  }
  return body;
}

export async function mutateGraph(
  mutation: GraphMutation,
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher("/api/admin/graph", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mutation),
  });
  const body = await payload(response);
  if (!response.ok) {
    throw new GraphMutationError(
      body?.error ?? `Could not update graph (${response.status})`,
      response.status
    );
  }
  return body;
}

export function activeGraphMapData(graph: AdminGraph): GraphMapData {
  const nodes = graph.nodes.filter((node) => node.state === "public");
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      label: node.displayLabel,
      type: node.kind,
      summary: node.displaySummary || null,
      href: node.href,
      pinned: node.pinned,
    })),
    edges: graph.edges
      .filter(
        (edge) =>
          edge.state === "public" &&
          nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
      )
      .map((edge) => ({
        id: edge.id,
        s: edge.sourceId,
        t: edge.targetId,
        kind: edge.kind,
      })),
  };
}

export function removedGraphItems(graph: AdminGraph) {
  const nodeStates = new Map(graph.nodes.map((node) => [node.id, node.state]));
  return {
    nodes: graph.nodes.filter((node) => node.state === "hidden"),
    edges: graph.edges.filter(
      (edge) =>
        edge.state === "hidden" &&
        [edge.sourceId, edge.targetId].every((id) => {
          const state = nodeStates.get(id);
          return state !== undefined && state !== "suggested";
        })
    ),
  };
}

export function canRestoreGraphEdge(
  graph: AdminGraph,
  edge: AdminGraphEdge
) {
  return [edge.sourceId, edge.targetId].every((id) =>
    graph.nodes.some((node) => node.id === id && node.state === "public")
  );
}

export function graphRestoreMutation(
  kind: "node" | "edge",
  item: AdminGraphNode | AdminGraphEdge
): GraphMutation {
  return {
    action: kind === "node" ? "setNodeState" : "setEdgeState",
    id: item.id,
    expectedVersion: item.version,
    state: "public",
  };
}

export default function GraphEditor() {
  const [graph, setGraph] = useState<AdminGraph>(emptyGraph);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<
    "details" | "connections" | "suggestions" | "removed"
  >("details");
  const [creating, setCreating] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [connectionKind, setConnectionKind] =
    useState<GraphEdgeKind>("semantic");
  const [conceptLabel, setConceptLabel] = useState("");
  const [conceptSummary, setConceptSummary] = useState("");
  const [conceptPinned, setConceptPinned] = useState(false);
  const [labelOverride, setLabelOverride] = useState("");
  const [summaryOverride, setSummaryOverride] = useState("");
  const [nodePinned, setNodePinned] = useState(false);
  const [removeConfirmationId, setRemoveConfirmationId] = useState<
    string | null
  >(null);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading graph");
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const removeConfirmationRef = useRef<HTMLDivElement | null>(null);
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? null;
  const visualization = useMemo(() => activeGraphMapData(graph), [graph]);
  const removed = useMemo(() => removedGraphItems(graph), [graph]);

  async function refresh(preferredId?: string | null) {
    const next = await loadAdminGraph();
    setGraph(next);
    const candidate = preferredId === undefined ? selectedId : preferredId;
    const nextSelected =
      candidate &&
      next.nodes.some(
        (node) => node.id === candidate && node.state === "public"
      )
        ? candidate
        : null;
    setSelectedId(nextSelected);
    setMessage("");
    return next;
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Could not load graph");
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLabelOverride(selected.labelOverride ?? "");
    setSummaryOverride(selected.summaryOverride ?? "");
    setNodePinned(selected.pinned);
  }, [selected]);

  useEffect(() => {
    if (removeConfirmationId) {
      removeConfirmationRef.current?.focus();
      return;
    }
    if (removeTriggerRef.current?.isConnected) {
      removeTriggerRef.current.focus();
    }
    removeTriggerRef.current = null;
  }, [removeConfirmationId]);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      if (error instanceof GraphMutationError && error.status === 409) {
        try {
          await refresh();
          setMessage("Graph changed in another session. Latest version loaded.");
        } catch (refreshError) {
          setMessage(
            refreshError instanceof Error
              ? refreshError.message
              : "Could not reload the graph"
          );
        }
      } else {
        setMessage(error instanceof Error ? error.message : "Graph update failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function beginConcept() {
    setCreating(true);
    setInspectorTab("details");
    setConnectSourceId(null);
    setRemoveConfirmationId(null);
    setConceptLabel("");
    setConceptSummary("");
    setConceptPinned(false);
  }

  async function submitConcept(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createGraphConcept({
        label: conceptLabel,
        summary: conceptSummary.trim() || null,
        pinned: conceptPinned,
      });
      setCreating(false);
      await refresh();
      setMessage("Concept created");
    });
  }

  async function saveNode(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await run(async () => {
      await mutateGraph({
        action: "updateNode",
        id: selected.id,
        expectedVersion: selected.version,
        node: {
          labelOverride: labelOverride.trim() || null,
          summaryOverride: summaryOverride.trim() || null,
          state: selected.state === "hidden" ? "hidden" : "public",
          pinned: nodePinned,
        },
      });
      await refresh(selected.id);
      setMessage("Node saved");
    });
  }

  async function chooseNode(id: string) {
    setCreating(false);
    setRemoveConfirmationId(null);
    if (connectSourceId && id !== connectSourceId) {
      await run(async () => {
        await mutateGraph({
          action: "connectNodes",
          sourceId: connectSourceId,
          targetId: id,
          kind: connectionKind,
        });
        setConnectSourceId(null);
        setSelectedId(id);
        await refresh(id);
        setMessage("Connection created");
      });
      return;
    }
    setSelectedId(id);
  }

  function beginConnection() {
    if (!selected) {
      setMessage("Select a source node first");
      return;
    }
    setConnectSourceId(selected.id);
    setMessage("Select another node to connect");
  }

  function edgeLabel(edge: AdminGraphEdge) {
    const source = graph.nodes.find((node) => node.id === edge.sourceId);
    const target = graph.nodes.find((node) => node.id === edge.targetId);
    return `${source?.displayLabel ?? "Missing node"} → ${target?.displayLabel ?? "Missing node"}`;
  }

  async function removeNode(node: AdminGraphNode) {
    const label = node.displayLabel;
    await run(async () => {
      const result = await mutateGraph({
        action: "setNodeState",
        id: node.id,
        expectedVersion: node.version,
        state: "hidden",
      });
      const next = await refresh(null);
      const persisted = next.nodes.find((candidate) => candidate.id === node.id);
      const expectedVersion =
        typeof result?.node?.version === "number"
          ? result.node.version
          : persisted?.version;
      if (expectedVersion === undefined) {
        throw new Error("Could not prepare undo for removed node");
      }
      setRemoveConfirmationId(null);
      setUndoAction({ kind: "node", id: node.id, label, expectedVersion });
      setMessage(`${label} removed`);
    });
  }

  async function removeEdge(edge: AdminGraphEdge) {
    const label = edgeLabel(edge);
    await run(async () => {
      const result = await mutateGraph({
        action: "setEdgeState",
        id: edge.id,
        expectedVersion: edge.version,
        state: "hidden",
      });
      const next = await refresh(selectedId);
      const persisted = next.edges.find((candidate) => candidate.id === edge.id);
      const expectedVersion =
        typeof result?.edge?.version === "number"
          ? result.edge.version
          : persisted?.version;
      if (expectedVersion === undefined) {
        throw new Error("Could not prepare undo for removed connection");
      }
      setRemoveConfirmationId(null);
      setUndoAction({ kind: "edge", id: edge.id, label, expectedVersion });
      setMessage(`${label} removed`);
    });
  }

  async function restoreRemovedItem(
    kind: "node" | "edge",
    item: AdminGraphNode | AdminGraphEdge,
    label: string
  ) {
    await run(async () => {
      await mutateGraph(graphRestoreMutation(kind, item));
      await refresh(kind === "node" ? item.id : selectedId);
      setInspectorTab("removed");
      setUndoAction((current) =>
        current?.kind === kind && current.id === item.id ? null : current
      );
      setMessage(`${label} restored`);
    });
  }

  async function undoRemoval() {
    if (!undoAction) return;
    const action = undoAction;
    await run(async () => {
      await mutateGraph({
        action: action.kind === "node" ? "setNodeState" : "setEdgeState",
        id: action.id,
        expectedVersion: action.expectedVersion,
        state: "public",
      });
      await refresh(action.kind === "node" ? action.id : selectedId);
      if (action.kind === "node") setInspectorTab("details");
      setUndoAction(null);
      setMessage(`${action.label} restored`);
    });
  }

  async function decideSuggestion(
    suggestion: AdminGraphSuggestion,
    state: "public" | "hidden"
  ) {
    await run(async () => {
      await mutateGraph({
        action: "decideSuggestion",
        suggestion: {
          sourceId: suggestion.sourceId,
          targetKey: suggestion.targetKey,
          targetLabel: suggestion.targetLabel,
          state,
        },
      });
      await refresh(selectedId);
      setInspectorTab("suggestions");
      setMessage(state === "public" ? "Suggestion accepted" : "Suggestion ignored");
    });
  }

  const selectedEdges = selected
    ? graph.edges.filter(
        (edge) =>
          edge.state === "public" &&
          (edge.sourceId === selected.id || edge.targetId === selected.id) &&
          graph.nodes.some(
            (node) =>
              node.id ===
                (edge.sourceId === selected.id
                  ? edge.targetId
                  : edge.sourceId) && node.state === "public"
          )
      )
    : [];
  const removeNodeLabel =
    selected?.origin === "automatic" ? "Hide from map" : "Remove concept";

  return (
    <AdminShell
      activeTab="graph"
      description="Living map nodes, connections, and suggestions"
    >
      <div className="graph-admin-toolbar">
        <button type="button" onClick={beginConcept} disabled={busy}>
          Add concept
        </button>
        <button type="button" onClick={beginConnection} disabled={busy}>
          Connect
        </button>
        {connectSourceId && (
          <>
            <label>
              Relationship
              <select
                value={connectionKind}
                onChange={(event) =>
                  setConnectionKind(event.target.value as GraphEdgeKind)
                }
                disabled={busy}
              >
                <option value="semantic">Related to</option>
                <option value="tag">Topic</option>
                <option value="link">Direct link</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setConnectSourceId(null);
                setMessage("");
              }}
              disabled={busy}
            >
              Cancel connection
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setRemoveConfirmationId(null);
            setInspectorTab("suggestions");
          }}
          disabled={busy}
        >
          Suggestions ({graph.suggestions.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setRemoveConfirmationId(null);
            setInspectorTab("removed");
          }}
          disabled={busy}
        >
          Removed ({removed.nodes.length + removed.edges.length})
        </button>
        <a href="/" target="_blank" rel="noreferrer">
          Preview public
        </a>
      </div>

      <div className="graph-admin-workspace">
        <div className="graph-admin-map">
          <GraphMap
            data={visualization}
            selectedId={selectedId}
            connectingFromId={connectSourceId}
            onSelect={(id) => void chooseNode(id)}
            ariaLabel="Editable knowledge map"
          />
        </div>

        <aside className="graph-admin-inspector" aria-label="Graph inspector">
          {!creating && (
            <div className="graph-admin-tabs" role="tablist">
              {(["details", "connections", "suggestions"] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === tab}
                    onClick={() => {
                      setRemoveConfirmationId(null);
                      setInspectorTab(tab);
                    }}
                  >
                    {tab === "details"
                      ? "Details"
                      : tab === "connections"
                        ? "Connections"
                        : `Suggestions (${graph.suggestions.length})`}
                  </button>
                )
              )}
            </div>
          )}

          {creating ? (
            <form className="graph-admin-form" onSubmit={submitConcept}>
              <div>
                <p className="eyebrow">New concept</p>
                <h2>Add a map idea</h2>
              </div>
              <label>
                Label
                <input
                  required
                  maxLength={200}
                  value={conceptLabel}
                  onChange={(event) => setConceptLabel(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Short summary
                <textarea
                  rows={4}
                  maxLength={500}
                  value={conceptSummary}
                  onChange={(event) => setConceptSummary(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="graph-admin-checkbox">
                <input
                  type="checkbox"
                  checked={conceptPinned}
                  onChange={(event) => setConceptPinned(event.target.checked)}
                  disabled={busy}
                />
                Show its label in the overview
              </label>
              <div className="graph-admin-actions">
                <button type="submit" disabled={busy}>
                  Create concept
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : inspectorTab === "suggestions" ? (
            <section className="graph-admin-suggestions">
              <div>
                <p className="eyebrow">Automatic suggestions</p>
                <h2>Review connections</h2>
              </div>
              {graph.suggestions.length === 0 ? (
                <p className="admin-meta">No suggestions waiting.</p>
              ) : (
                <ul>
                  {graph.suggestions.map((suggestion) => {
                    const source = graph.nodes.find(
                      (node) => node.id === suggestion.sourceId
                    );
                    return (
                      <li key={suggestion.id}>
                        <p>
                          <strong>{source?.displayLabel ?? "Content"}</strong>
                          <span> → {suggestion.targetLabel}</span>
                        </p>
                        <small>From “{suggestion.evidence}”</small>
                        <div className="graph-admin-actions">
                          <button
                            type="button"
                            onClick={() =>
                              void decideSuggestion(suggestion, "public")
                            }
                            disabled={busy}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void decideSuggestion(suggestion, "hidden")
                            }
                            disabled={busy}
                          >
                            Ignore
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : inspectorTab === "removed" ? (
            <section className="graph-admin-removed">
              <div>
                <p className="eyebrow">Removed items</p>
                <h2>Restore map content</h2>
                <p className="admin-meta">
                  Removed items stay stored until you restore them.
                </p>
              </div>

              <div className="graph-admin-removed-group">
                <h3>Nodes</h3>
                {removed.nodes.length === 0 ? (
                  <p className="admin-meta">No removed nodes.</p>
                ) : (
                  <ul>
                    {removed.nodes.map((node) => (
                      <li key={node.id}>
                        <div>
                          <strong>{node.displayLabel}</strong>
                          <small>
                            {node.origin === "automatic"
                              ? "Synced content"
                              : "Manual concept"}
                          </small>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void restoreRemovedItem(
                              "node",
                              node,
                              node.displayLabel
                            )
                          }
                          disabled={busy}
                        >
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="graph-admin-removed-group">
                <h3>Connections</h3>
                {removed.edges.length === 0 ? (
                  <p className="admin-meta">No removed connections.</p>
                ) : (
                  <ul>
                    {removed.edges.map((edge) => {
                      const label = edgeLabel(edge);
                      const canRestore = canRestoreGraphEdge(graph, edge);
                      return (
                        <li key={edge.id}>
                          <div>
                            <strong>{label}</strong>
                            <small>
                              {canRestore
                                ? edge.kind
                                : `${edge.kind} · Restore both nodes first`}
                            </small>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              void restoreRemovedItem("edge", edge, label)
                            }
                            disabled={busy || !canRestore}
                          >
                            {canRestore ? "Restore" : "Restore nodes first"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          ) : !selected ? (
            <section className="graph-admin-empty">
              <p className="eyebrow">Inspector</p>
              <h2>Select a node</h2>
              <p>
                Choose a node in the map to edit its label, summary, visibility,
                and connections.
              </p>
            </section>
          ) : inspectorTab === "connections" ? (
            <section className="graph-admin-connections">
              <div>
                <p className="eyebrow">{selected.displayLabel}</p>
                <h2>Connections</h2>
              </div>
              {selectedEdges.length === 0 ? (
                <p className="admin-meta">This node has no connections yet.</p>
              ) : (
                <ul>
                  {selectedEdges.map((edge) => {
                    const otherId =
                      edge.sourceId === selected.id
                        ? edge.targetId
                        : edge.sourceId;
                    const other = graph.nodes.find(
                      (node) => node.id === otherId
                    );
                    return (
                      <li key={edge.id}>
                        <button
                          type="button"
                          className="graph-connection-node"
                          onClick={() => setSelectedId(otherId)}
                        >
                          {other?.displayLabel ?? "Missing node"}
                        </button>
                        <span>{edge.kind}</span>
                        <button
                          type="button"
                          className="graph-admin-danger"
                          aria-expanded={removeConfirmationId === edge.id}
                          onClick={(event) => {
                            removeTriggerRef.current = event.currentTarget;
                            setRemoveConfirmationId(edge.id);
                          }}
                          disabled={busy || removeConfirmationId === edge.id}
                        >
                          Remove connection
                        </button>
                        {removeConfirmationId === edge.id && (
                          <div
                            ref={removeConfirmationRef}
                            className="graph-admin-remove-confirmation"
                            role="alertdialog"
                            aria-label={`Remove ${edgeLabel(edge)} connection?`}
                            tabIndex={-1}
                          >
                            <p>
                              This removes the connection from the public map.
                              You can restore it later.
                            </p>
                            <div className="graph-admin-actions">
                              <button
                                type="button"
                                className="graph-admin-danger"
                                onClick={() => void removeEdge(edge)}
                                disabled={busy}
                              >
                                Remove connection
                              </button>
                              <button
                                type="button"
                                onClick={() => setRemoveConfirmationId(null)}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <button type="button" onClick={beginConnection} disabled={busy}>
                Connect another node
              </button>
            </section>
          ) : (
            <form className="graph-admin-form" onSubmit={saveNode}>
              <div>
                <p className="eyebrow">{selected.kind}</p>
                <h2>{selected.displayLabel}</h2>
                <p className="admin-meta">
                  {selected.origin === "automatic"
                    ? "Synced from published content"
                    : "Manual concept"}
                </p>
              </div>
              <label>
                Label override
                <input
                  value={labelOverride}
                  placeholder={selected.label}
                  maxLength={200}
                  onChange={(event) => setLabelOverride(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Short summary
                <textarea
                  rows={5}
                  value={summaryOverride}
                  placeholder={selected.body || "Describe this node"}
                  maxLength={500}
                  onChange={(event) => setSummaryOverride(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="graph-admin-checkbox">
                <input
                  type="checkbox"
                  checked={nodePinned}
                  onChange={(event) => setNodePinned(event.target.checked)}
                  disabled={busy}
                />
                Show its label in the overview
              </label>
              <div className="graph-admin-actions">
                <button type="submit" disabled={busy}>
                  Save changes
                </button>
                <span className="admin-meta">Version {selected.version}</span>
              </div>
              <button
                type="button"
                className="graph-admin-remove-trigger"
                aria-expanded={removeConfirmationId === selected.id}
                onClick={(event) => {
                  removeTriggerRef.current = event.currentTarget;
                  setRemoveConfirmationId(selected.id);
                }}
                disabled={busy || removeConfirmationId === selected.id}
              >
                {removeNodeLabel}
              </button>
              {removeConfirmationId === selected.id && (
                <div
                  ref={removeConfirmationRef}
                  className="graph-admin-remove-confirmation"
                  role="alertdialog"
                  aria-label={`${removeNodeLabel} ${selected.displayLabel}?`}
                  tabIndex={-1}
                >
                  <p>
                    This removes the node from the public map. Its relationships
                    stay stored.
                  </p>
                  <div className="graph-admin-actions">
                    <button
                      type="button"
                      className="graph-admin-danger"
                      onClick={() => void removeNode(selected)}
                      disabled={busy}
                    >
                      {removeNodeLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveConfirmationId(null)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </aside>
      </div>

      {(message || undoAction) && (
        <div className="admin-message graph-admin-notice" role="status">
          {message && <span>{message}</span>}
          {undoAction && (
            <button type="button" onClick={() => void undoRemoval()} disabled={busy}>
              Undo
            </button>
          )}
        </div>
      )}

      <style>{`
        .graph-admin-toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: .6rem; margin-top: 1.5rem; padding-bottom: .9rem; border-bottom: 1px solid var(--hairline); }
        .graph-admin-toolbar label { display: grid; gap: .25rem; color: var(--muted); font: .7rem var(--mono); }
        .graph-admin-toolbar select { min-height: 2.1rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--bg); color: var(--ink); font: .8rem var(--mono); padding-inline: .45rem; }
        .graph-admin-toolbar a { margin-left: auto; color: var(--muted); font: .75rem var(--mono); }
        .graph-admin-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(18rem, 21rem); min-height: 31rem; }
        .graph-admin-map { min-width: 0; display: grid; align-items: center; padding: 1rem 1.25rem 1rem 0; }
        .graph-admin-inspector { min-width: 0; border-left: 1px solid var(--hairline); padding: 1.25rem 0 1.25rem 1.5rem; }
        .graph-admin-tabs { display: flex; gap: .25rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--hairline); overflow-x: auto; }
        .graph-admin-tabs button { flex: none; border: 0; border-bottom: 1px solid transparent; border-radius: 0; background: transparent; color: var(--muted); margin-bottom: -1px; padding-inline: .4rem; }
        .graph-admin-tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--ink); }
        .graph-admin-form, .graph-admin-empty, .graph-admin-connections, .graph-admin-suggestions, .graph-admin-removed { display: grid; align-content: start; gap: 1rem; }
        .graph-admin-inspector h2 { margin: .2rem 0 0; }
        .graph-admin-inspector h3 { margin: 0; font-size: .95rem; }
        .graph-admin-form label { display: grid; gap: .3rem; color: var(--muted); font: .75rem var(--mono); }
        .graph-admin-form input, .graph-admin-form select, .graph-admin-form textarea { width: 100%; padding: .55rem .6rem; border: 1px solid var(--hairline); border-radius: 4px; color: var(--ink); background: var(--bg); font: inherit; }
        .graph-admin-form textarea { resize: vertical; line-height: 1.45; }
        .graph-admin-checkbox { grid-template-columns: auto 1fr !important; align-items: center; }
        .graph-admin-checkbox input { width: auto; }
        .graph-admin-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
        .graph-admin-connections ul, .graph-admin-suggestions ul { display: grid; gap: .65rem; list-style: none; padding: 0; }
        .graph-admin-connections li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: .5rem; border-top: 1px solid var(--hairline); padding-top: .65rem; }
        .graph-admin-connections li > span, .graph-admin-suggestions small { color: var(--muted); font: .7rem var(--mono); }
        .graph-connection-node { overflow: hidden; border: 0 !important; background: transparent !important; padding: 0 !important; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
        .graph-admin-suggestions li { display: grid; gap: .45rem; border: 1px solid var(--hairline); padding: .75rem; }
        .graph-admin-suggestions li p { margin: 0; }
        .graph-admin-removed-group { display: grid; gap: .55rem; padding-top: .8rem; border-top: 1px solid var(--hairline); }
        .graph-admin-removed-group ul { display: grid; gap: .5rem; list-style: none; margin: 0; padding: 0; }
        .graph-admin-removed-group li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .75rem; padding: .65rem; border: 1px solid var(--hairline); }
        .graph-admin-removed-group li > div { min-width: 0; display: grid; gap: .2rem; }
        .graph-admin-removed-group strong { overflow-wrap: anywhere; font-size: .85rem; }
        .graph-admin-removed-group small { color: var(--muted); font: .68rem var(--mono); }
        .graph-admin-remove-trigger { justify-self: start; color: var(--muted); }
        .graph-admin-remove-confirmation { display: grid; gap: .7rem; padding: .75rem; border: 1px solid var(--ink); }
        .graph-admin-connections .graph-admin-remove-confirmation { grid-column: 1 / -1; }
        .graph-admin-remove-confirmation p { margin: 0; color: var(--muted); font-size: .85rem; line-height: 1.45; }
        .graph-admin-danger { border-color: var(--ink) !important; color: var(--ink) !important; }
        .graph-admin-notice { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; }
        .graph-admin-notice button { flex: none; }
        .graph-admin-toolbar button:focus-visible, .graph-admin-tabs button:focus-visible, .graph-admin-inspector button:focus-visible, .graph-admin-notice button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
        @media (max-width: 760px) {
          .graph-admin-toolbar a { margin-left: 0; }
          .graph-admin-workspace { grid-template-columns: 1fr; }
          .graph-admin-map { padding: .75rem 0; }
          .graph-admin-inspector { border-left: 0; border-top: 1px solid var(--hairline); padding: 1.25rem 0 0; }
          .graph-admin-removed-group li { align-items: start; }
        }
      `}</style>
    </AdminShell>
  );
}
