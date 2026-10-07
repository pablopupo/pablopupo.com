import type { PublicEntry } from "./public-content";
import type { PublicGraphData, PublicGraphNode } from "./public-graph";
import { collectSeries, seriesPath } from "./series";

export function buildHomeGraph(source: PublicGraphData, entries: PublicEntry[]): PublicGraphData {
  const entriesByUrl = new Map(entries.map((entry) => [`/${entry.section}/${entry.slug}`, entry]));
  const replacements = new Map<string, string>();
  const seriesNodes: PublicGraphNode[] = [];
  for (const series of collectSeries(entries)) {
    const urls = new Set(series.entries.map((entry) => `/${entry.section}/${entry.slug}`));
    const members = source.nodes.filter((node) => node.href && urls.has(node.href));
    if (!members.length) continue;
    const id = `series:${series.section}:${series.slug}`;
    for (const node of members) replacements.set(node.id, id);
    seriesNodes.push({
      id, label: series.title, type: series.entries.some((entry) => entry.performance) ? "music" : "writing", href: seriesPath(series),
      summary: `${series.entries.length} ${series.entries.length === 1 ? "post" : "posts"}${series.section === "music" ? ", with recordings and notes" : ""}.`,
      pinned: true, deg: 0,
    });
  }
  const nodes: PublicGraphNode[] = [...source.nodes.filter((node) => !replacements.has(node.id)).map((node) => {
    const entry = node.href ? entriesByUrl.get(node.href) : undefined;
    return { ...node, type: entry ? entry.kind === "performance" ? "music" as const : "writing" as const : node.type };
  }), ...seriesNodes];
  const edges = source.edges.map((edge) => ({ ...edge, s: replacements.get(edge.s) ?? edge.s, t: replacements.get(edge.t) ?? edge.t }));

  function addHub(key: "engineering" | "music", label: string, href: string, summary: string, members: PublicGraphNode[]) {
    if (!members.length) return;
    let hub = nodes.find((node) => node.type === "concept" && node.label.toLowerCase() === label.toLowerCase());
    if (!hub) {
      hub = { id: `hub:${key}`, label, type: "concept", href, summary, pinned: true, deg: 0 };
      nodes.push(hub);
    }
    Object.assign(hub, { hub: key, href, summary, pinned: true });
    for (const member of members) edges.push({ id: `hub:${key}:${member.id}`, s: hub.id, t: member.id, kind: "tag" });
  }

  // These are entry points into public work, not new content or synthetic project links.
  addHub("engineering", "Engineering", "/work", "Software, AI systems, and the projects I’m building.", nodes.filter((node) => node.type === "project"));
  addHub("music", "Music", "/music", "Performances, compositions, and notes on what I’m playing and listening to.", nodes.filter((node) => node.type === "music" || node.href?.startsWith("/music/") || node.href === "/accordo"));

  // Explicit editorial relationship: these two projects involve payments.
  const projects = nodes.filter((node) => node.type === "project" && (node.href === "/accordo" || node.href === "/work/nova"));
  if (projects.length) {
    let payments = nodes.find((node) => node.type === "concept" && (node.id === "payments" || node.label.toLowerCase() === "payments"));
    if (!payments) {
      payments = { id: "payments", label: "Payments", type: "concept", summary: "Payment workflows in Accordo and Nova.", href: null, pinned: true, deg: 0 };
      nodes.push(payments);
    }
    payments.pinned = true;
    for (const project of projects) edges.push({ id: `editorial:payments:${project.id}`, s: payments.id, t: project.id, kind: "tag" });
  }
  const ids = new Set(nodes.map((node) => node.id));
  const seen = new Set<string>();
  const validEdges = edges.filter((edge) => {
    const key = [edge.s, edge.t].sort().join("~");
    if (edge.s === edge.t || !ids.has(edge.s) || !ids.has(edge.t) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { nodes: nodes.map((node) => ({ ...node, deg: validEdges.filter((edge) => edge.s === node.id || edge.t === node.id).length })), edges: validEdges };
}
