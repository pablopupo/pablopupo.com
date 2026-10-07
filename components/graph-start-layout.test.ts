import { describe, expect, it } from "vitest";
import curated from "../data/graph.json";
import { buildHomeGraph } from "../lib/home-graph";
import { layoutGraph, type GraphMapData, type PositionedGraphNode } from "./graph-map";

const core = buildHomeGraph({
  nodes: [
    ...curated.concepts.map((node) => ({ ...node, type: "concept" as const, href: null, summary: null, pinned: false, deg: 0 })),
    ...curated.nodes.map((node) => ({ ...node, type: "project" as const, summary: null, deg: 0 })),
  ],
  edges: curated.nodes.flatMap((node) => node.tags.map((tag) => ({ id: `${node.id}-${tag}`, s: node.id, t: tag, kind: "tag" as const }))),
}, []);

const graph: GraphMapData = {
  nodes: [...core.nodes, ...["composition-in-e-flat-major", "beethoven-sonata-op-10-no-2", "schumann-abegg-variations", "why-im-building-accordo"].map((slug) => ({
    id: slug, label: slug, href: `/music/${slug}`, type: "music" as const, summary: null, pinned: false,
  }))],
  edges: [...core.edges, ...["composition-in-e-flat-major", "beethoven-sonata-op-10-no-2", "schumann-abegg-variations", "why-im-building-accordo"].map((slug) => ({
    id: `music-${slug}`, s: "music", t: slug, kind: "tag" as const,
  })), { id: "accordo-note", s: "accordo", t: "why-im-building-accordo", kind: "link" }],
};

function crossings(nodes: PositionedGraphNode[], edges: GraphMapData["edges"]) {
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const side = (a: PositionedGraphNode, b: PositionedGraphNode, p: PositionedGraphNode) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  let count = 0;
  edges.forEach((edge, index) => edges.slice(index + 1).forEach((other) => {
    const [a, b, c, d] = [edge.s, edge.t, other.s, other.t].map((id) => positions.get(id)!);
    if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) count++;
  }));
  return count;
}

describe("homepage map composition", () => {
  it.each([[600, 420], [360, 620]])("keeps the branches readable on a %s by %s canvas", (width, height) => {
    const nodes = layoutGraph(graph, width, height, true);
    expect(crossings(nodes, graph.edges)).toBeLessThanOrEqual(1);
    expect(layoutGraph({ nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() }, width, height, true)).toEqual(nodes);
    for (const node of nodes) {
      expect(node.x).toBeGreaterThan(20);
      expect(node.x).toBeLessThan(width - 20);
      expect(node.y).toBeGreaterThan(20);
      expect(node.y).toBeLessThan(height - 20);
      expect(node).not.toHaveProperty("fx");
      expect(node).not.toHaveProperty("fy");
    }
  });

  it("places new content without moving the established starting points or depending on database IDs", () => {
    const initial = layoutGraph(graph, 600, 420, true);
    const updated: GraphMapData = {
      nodes: [...graph.nodes, { id: "new-piece", label: "New piece", type: "music", href: "/music/new-piece", summary: null, pinned: false }],
      edges: [...graph.edges, { id: "new-piece-music", s: "new-piece", t: "music", kind: "tag" }],
    };
    const nodes = layoutGraph(updated, 600, 420, true);
    for (const node of initial) {
      expect(nodes.find((candidate) => candidate.id === node.id)).toMatchObject({ x: node.x, y: node.y });
    }
    const added = nodes.find((node) => node.id === "new-piece")!;
    expect(initial.every((node) => Math.hypot(added.x - node.x, added.y - node.y) > 40)).toBe(true);
    const renamed = layoutGraph({ nodes: graph.nodes.map((node) => ({ ...node, id: `db:${node.id}` })), edges: graph.edges.map((edge) => ({ ...edge, s: `db:${edge.s}`, t: `db:${edge.t}` })) }, 600, 420, true);
    expect(renamed.map(({ x, y }) => [x, y])).toEqual(initial.map(({ x, y }) => [x, y]));
  });
});
