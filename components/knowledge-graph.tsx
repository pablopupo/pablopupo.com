"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import GraphMap, {
  compareCodeUnits,
  type GraphMapData,
} from "@/components/graph-map";
import type {
  PublicGraphData,
  PublicGraphNode,
  PublicGraphNodeType,
} from "@/lib/public-graph";

const TYPE_LABELS: Record<PublicGraphNodeType, string> = {
  concept: "Concept",
  project: "Project",
  writing: "Writing",
  music: "Music",
};

const DESTINATION_LABELS: Record<PublicGraphNodeType, string> = {
  concept: "View",
  project: "View project",
  writing: "Read note",
  music: "View performance",
};

function graphMapData(data: PublicGraphData): GraphMapData {
  return {
    nodes: data.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      summary: node.summary,
      href: node.href,
      pinned: Boolean(node.pinned),
    })),
    edges: data.edges.map((edge, index) => ({
      id: edge.id ?? `${edge.s}:${edge.t}:${edge.kind}:${index}`,
      s: edge.s,
      t: edge.t,
      kind: edge.kind,
    })),
  };
}

function connectedNodes(data: PublicGraphData, selectedId: string) {
  const connectedIds = new Set<string>();
  for (const edge of data.edges) {
    if (edge.s === selectedId) connectedIds.add(edge.t);
    if (edge.t === selectedId) connectedIds.add(edge.s);
  }
  return data.nodes
    .filter((node) => connectedIds.has(node.id))
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        compareCodeUnits(left.label, right.label) ||
        compareCodeUnits(left.id, right.id)
    );
}

function fallbackSummary(node: PublicGraphNode) {
  return node.type === "concept"
    ? `Work and ideas connected to ${node.label}.`
    : `${node.label} is part of this site’s growing map.`;
}

export default function KnowledgeGraph({ data }: { data: PublicGraphData }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graphLayoutRef = useRef<HTMLDivElement>(null);
  const pendingFocusId = useRef<string | null>(null);
  const transitionSequence = useRef(0);
  const visualization = useMemo(() => graphMapData(data), [data]);
  const selected = data.nodes.find((node) => node.id === selectedId) ?? null;
  const connected = selected ? connectedNodes(data, selected.id) : [];

  useEffect(() => {
    const targetId = pendingFocusId.current;
    if (!targetId) return;
    const nodes =
      graphLayoutRef.current?.querySelectorAll<SVGGElement>(
        "[data-graph-node]"
      ) ?? [];
    [...nodes]
      .find((node) => node.getAttribute("data-graph-node") === targetId)
      ?.focus();
    pendingFocusId.current = null;
  }, [selectedId]);

  if (data.nodes.length === 0) {
    return <p className="graph-empty">The map will grow as work is published.</p>;
  }

  function transitionSelection(update: () => void) {
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (
      reduceMotion ||
      typeof document.startViewTransition !== "function"
    ) {
      update();
      return;
    }

    const sequence = transitionSequence.current + 1;
    transitionSequence.current = sequence;
    document.documentElement.classList.add("graph-inspector-transition");
    const transition = document.startViewTransition(() => {
      flushSync(update);
    });
    const finish = () => {
      if (transitionSequence.current === sequence) {
        document.documentElement.classList.remove(
          "graph-inspector-transition"
        );
      }
    };
    void transition.finished.then(finish, finish);
  }

  function selectNode(nodeId: string) {
    transitionSelection(() => {
      setSelectedId((currentId) => (currentId === nodeId ? null : nodeId));
    });
  }

  function selectConnectedNode(nodeId: string) {
    pendingFocusId.current = nodeId;
    transitionSelection(() => setSelectedId(nodeId));
  }

  return (
    <div className="graph-layout" ref={graphLayoutRef}>
      <GraphMap
        data={visualization}
        selectedId={selected?.id ?? null}
        onSelect={selectNode}
        ariaLabel="Knowledge map of Pablo Pupo’s work, writing, and music"
      />
      <aside className="graph-inspector" aria-live="polite">
        <div
          key={selected?.id ?? "overview"}
          className="graph-inspector-content"
        >
          {selected ? (
            <>
              <p className="graph-inspector-type">
                {TYPE_LABELS[selected.type]}
              </p>
              <h2>{selected.label}</h2>
              <p className="graph-inspector-summary">
                {selected.summary ?? fallbackSummary(selected)}
              </p>

              {connected.length > 0 && (
                <div className="graph-connections">
                  <p>Connected</p>
                  <div>
                    {connected.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        aria-label={`Select ${node.label}`}
                        onClick={() => selectConnectedNode(node.id)}
                      >
                        {node.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selected.href && (
                <Link className="graph-destination" href={selected.href}>
                  {DESTINATION_LABELS[selected.type]}
                  <span aria-hidden="true"> →</span>
                </Link>
              )}
            </>
          ) : (
            <>
              <p className="graph-inspector-type">Knowledge map</p>
              <h2>Explore the connections</h2>
              <p className="graph-inspector-summary">
                Select a node to see how projects, notes, ideas, and music
                connect.
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
