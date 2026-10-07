"use client";

import { useMemo } from "react";
import GraphMap, { type GraphMapData } from "./graph-map";
import GraphSymbol from "./graph-symbol";
import type { PublicGraphData } from "@/lib/public-graph";
import { scoreSearchMatch } from "@/lib/search-matching";

export default function SearchMap({ data, query, resultHrefs, onChoose }: {
  data: PublicGraphData;
  query: string;
  resultHrefs: string[];
  onChoose: (query: string) => void;
}) {
  const visualization = useMemo<GraphMapData>(() => ({
    nodes: data.nodes.map((node) => ({ ...node, pinned: Boolean(node.pinned), shortLabel: node.type === "music" && node.label.includes(",") ? node.label.split(",")[0] : node.type === "music" && node.label.startsWith("Composition") ? "Composition" : undefined })),
    edges: data.edges.map((edge, index) => ({ ...edge, id: edge.id ?? `search-edge-${index}` })),
  }), [data]);
  const matches = query.trim().length >= 2 ? new Set(data.nodes.filter((node) =>
    (node.href && resultHrefs.includes(node.href)) || scoreSearchMatch(query, node.label, node.summary ?? "", "", "") !== undefined
  ).map((node) => node.id)) : null;
  return <section className="search-map" aria-label="Search the map">
    <div className="search-map-heading"><h2>The map</h2><ul className="graph-key" aria-label="Map key">
      {([["project", "Projects"], ["concept", "Topics"], ["music", "Music"], ["writing", "Writing"]] as const).map(([type, label]) => <li key={type}>
        <svg viewBox="0 0 20 20" className={`graph-key-symbol is-${type}`} aria-hidden="true"><GraphSymbol type={type} x={10} y={10} size={4} /></svg>{label}
      </li>)}
    </ul></div>
    <div className="search-map-canvas"><GraphMap data={visualization} layout="organic" compact selectedId={data.nodes.find((node) => node.label.toLowerCase() === query.trim().toLowerCase())?.id ?? null} highlightedIds={matches}
      ariaLabel="Choose a project, recording, or topic to search" onSelect={(id) => {
        const node = data.nodes.find((item) => item.id === id);
        if (node) onChoose(node.label);
      }} /></div>
  </section>;
}
