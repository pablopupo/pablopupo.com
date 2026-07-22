import generatedGraph from "../data/graph.generated.json";
import curatedGraph from "../data/graph.json";
import type { PublicEntry, PublicProject } from "./public-content";

export type PublicGraphNodeType =
  | "project"
  | "oss"
  | "concept"
  | "writing"
  | "music";

export type PublicGraphNode = {
  id: string;
  label: string;
  type: PublicGraphNodeType;
  href: string | null;
  deg: number;
};

export type PublicGraphEdge = {
  s: string;
  t: string;
  kind: "tag" | "link" | "semantic";
  terms?: string[];
};

export type PublicGraphData = {
  nodes: PublicGraphNode[];
  edges: PublicGraphEdge[];
};

type GeneratedGraph = PublicGraphData;

type CuratedConcept = {
  id: string;
  label: string;
};

type CuratedNode = {
  id: string;
  label: string;
  type: PublicGraphNodeType;
  href: string | null;
  tags?: string[];
};

type CuratedGraph = {
  concepts: CuratedConcept[];
  nodes: CuratedNode[];
};

type GraphSources = {
  generated: GeneratedGraph;
  curated: CuratedGraph;
};

function conceptId(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueTags(values: string[]) {
  const tags = new Map<string, string>();
  for (const value of values) {
    const label = value.trim();
    const id = conceptId(label);
    if (id && !tags.has(id)) tags.set(id, label);
  }
  return tags;
}

export function buildPublicGraph(
  projects: PublicProject[],
  entries: PublicEntry[],
  sources: GraphSources = {
    generated: generatedGraph as GeneratedGraph,
    curated: curatedGraph as CuratedGraph,
  }
): PublicGraphData {
  const nodes = new Map<string, PublicGraphNode>();
  const edges: PublicGraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const curatedConcepts = new Map(
    sources.curated.concepts.map((concept) => [concept.id, concept.label])
  );
  const curatedNodes = new Map(
    sources.curated.nodes.map((node) => [node.id, node])
  );

  function addNode(node: Omit<PublicGraphNode, "deg">) {
    nodes.set(node.id, { ...node, deg: 0 });
  }

  function addConcept(id: string, fallbackLabel?: string) {
    if (nodes.has(id)) return;
    addNode({
      id,
      label: curatedConcepts.get(id) ?? fallbackLabel ?? id.replaceAll("-", " "),
      type: "concept",
      href: null,
    });
  }

  function addEdge(edge: PublicGraphEdge) {
    if (edge.s === edge.t || !nodes.has(edge.s) || !nodes.has(edge.t)) return;
    const key = [edge.s, edge.t].sort().join("~");
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  }

  for (const node of sources.generated.nodes) {
    if (node.type === "oss") {
      addNode({ id: node.id, label: node.label, type: "oss", href: node.href });
    }
  }
  for (const node of sources.curated.nodes) {
    if (node.type === "oss" && !nodes.has(node.id)) {
      addNode({ id: node.id, label: node.label, type: "oss", href: node.href });
    }
  }

  const staticIds = new Set(nodes.keys());
  for (const edge of sources.generated.edges) {
    const sourceStatic = staticIds.has(edge.s);
    const targetStatic = staticIds.has(edge.t);
    const sourceConcept = curatedConcepts.has(edge.s);
    const targetConcept = curatedConcepts.has(edge.t);
    if (
      !(
        (sourceStatic && targetStatic) ||
        (sourceStatic && targetConcept) ||
        (targetStatic && sourceConcept)
      )
    ) {
      continue;
    }
    if (sourceConcept) addConcept(edge.s);
    if (targetConcept) addConcept(edge.t);
    addEdge(edge);
  }

  function connectTags(nodeId: string, values: string[]) {
    for (const [id, label] of uniqueTags(values)) {
      addConcept(id, label);
      addEdge({ s: nodeId, t: id, kind: "tag" });
    }
  }

  for (const project of projects) {
    const id = `project:${project.slug}`;
    addNode({
      id,
      label: project.title,
      type: "project",
      href: `/work#${project.slug}`,
    });
    connectTags(id, [
      ...(curatedNodes.get(project.slug)?.tags ?? []),
      ...project.technologies,
    ]);
  }

  for (const entry of entries) {
    const id = `entry:${entry.section}:${entry.slug}`;
    addNode({
      id,
      label: entry.title,
      type: entry.section,
      href: `/${entry.section}/${entry.slug}`,
    });
    connectTags(id, [
      ...(curatedNodes.get(entry.slug)?.tags ?? []),
      ...entry.tags,
      ...(entry.section === "music" ? ["music"] : []),
    ]);
  }

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.s, (degree.get(edge.s) ?? 0) + 1);
    degree.set(edge.t, (degree.get(edge.t) ?? 0) + 1);
  }

  const publicNodes = [...nodes.values()]
    .filter((node) => node.type !== "concept" || (degree.get(node.id) ?? 0) > 0)
    .map((node) => ({ ...node, deg: degree.get(node.id) ?? 0 }));
  const publicIds = new Set(publicNodes.map((node) => node.id));

  return {
    nodes: publicNodes,
    edges: edges.filter((edge) => publicIds.has(edge.s) && publicIds.has(edge.t)),
  };
}
