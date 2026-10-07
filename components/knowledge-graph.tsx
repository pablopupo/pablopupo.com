"use client";

import { externalLinkProps } from "@/lib/links";

import Link from "@/components/page-link";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { YoutubeEmbed } from "./public-entry-list";
import GraphSymbol from "./graph-symbol";
import AccordoLogo from "./accordo-logo";
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
  concept: "Topic",
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

type PerformancePreview = { youtubeUrl: string; title: string; label?: string };
const EMPTY_PERFORMANCES: Record<string, PerformancePreview> = {};

function graphMapData(data: PublicGraphData, performances: Record<string, PerformancePreview>): GraphMapData {
  return {
    nodes: data.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      shortLabel: performances[node.id]?.label,
      type: node.type,
      summary: node.summary,
      href: node.href,
      pinned: Boolean(node.pinned),
      hub: node.hub,
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

export default function KnowledgeGraph({
  data,
  initialSelectedId = null,
  performances = EMPTY_PERFORMANCES,
  hubStyle = "rings",
}: {
  data: PublicGraphData;
  initialSelectedId?: string | null;
  performances?: Record<string, PerformancePreview>;
  hubStyle?: "rings" | "halo" | "names";
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const graphLayoutRef = useRef<HTMLDivElement>(null);
  const pendingFocusId = useRef<string | null>(null);
  const transitionSequence = useRef(0);
  const visualization = useMemo(() => graphMapData(data, performances), [data, performances]);
  const selected = data.nodes.find((node) => node.id === selectedId) ?? null;
  const connected = selected ? connectedNodes(data, selected.id) : [];
  const performance = selected ? performances[selected.id] : undefined;
  const startingPoints = data.nodes.filter((node) => node.hub).sort((a, b) => compareCodeUnits(a.hub!, b.hub!));

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
      setSelectedId((currentId) => (currentId === nodeId && !initialSelectedId ? null : nodeId));
    });
  }

  function selectConnectedNode(nodeId: string) {
    pendingFocusId.current = nodeId;
    transitionSelection(() => setSelectedId(nodeId));
  }

  return (
    <section className="graph-explorer" aria-labelledby="connections-title">
      <div className="graph-heading">
        <h2 id="connections-title">The map</h2>
        <ul className="graph-key" aria-label="Map key">
          {([ ["project", "Projects"], ["concept", "Topics"], ["music", "Music"], ["writing", "Writing"] ] as const).map(([type, label]) => <li key={type}>
            <svg viewBox="0 0 20 20" className={`graph-key-symbol is-${type}`} aria-hidden="true"><GraphSymbol type={type} x={10} y={10} size={type === "concept" ? 3.5 : type === "music" ? 5.5 : 4.5} /></svg>
            <span>{label}</span>
          </li>)}
        </ul>
      </div>
    <div className="graph-layout" ref={graphLayoutRef}>
      <GraphMap
        layout="organic"
        hubStyle={hubStyle}
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
                {selected.hub ? "Explore" : selected.id.startsWith("series:") ? "Series" : TYPE_LABELS[selected.type]}
              </p>
              <h3 className={selected.href === "/accordo" ? "graph-inspector-brand" : undefined}>{selected.href === "/accordo" ? <AccordoLogo /> : selected.label}</h3>
              {performance ? (
                <div className="graph-performance">
                  <YoutubeEmbed url={performance.youtubeUrl} title={performance.title} />
                </div>
              ) : (
                <p className="graph-inspector-summary">
                  {selected.summary ?? fallbackSummary(selected)}
                </p>
              )}

              {selected.href && (
                <Link className="graph-destination" href={selected.href} transitionTypes={["from-connections"]} {...externalLinkProps(selected.href)}>
                  {selected.hub ? `All ${selected.hub}` : selected.id.startsWith("series:") ? "View series" : DESTINATION_LABELS[selected.type]}
                  <span aria-hidden="true"> →</span>
                </Link>
              )}

              {connected.length > 0 && (
                <div className="graph-connections">
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


            </>
          ) : (
            <>
              <h3>Pick a starting point</h3>
              {startingPoints.length > 0 && (
                <div className="graph-starting-points">
                  {startingPoints.map((node) => <button key={node.id} type="button" onClick={() => selectConnectedNode(node.id)}>
                    {node.label}<span aria-hidden="true">↗</span>
                  </button>)}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
    </section>
  );
}
