import curatedGraph from "../data/graph.json";
import { getDatabase } from "./db/client";
import { createContentRepository } from "./db/repository";
import type { PublicEntry, PublicProject } from "./public-content";

export type PublicGraphNodeType =
  | "project"
  | "concept"
  | "writing"
  | "music";

export type PublicGraphNode = {
  id: string;
  label: string;
  type: PublicGraphNodeType;
  summary: string | null;
  href: string | null;
  pinned: boolean;
  deg: number;
};

export type PublicGraphEdge = {
  id: string;
  s: string;
  t: string;
  kind: "tag" | "link" | "semantic";
};

export type PublicGraphData = {
  nodes: PublicGraphNode[];
  edges: PublicGraphEdge[];
};

type CuratedConcept = {
  id: string;
  label: string;
  pinned?: boolean;
};

type CuratedNode = {
  id: string;
  label: string;
  type: PublicGraphNodeType | "oss";
  href: string | null;
  pinned?: boolean;
  tags?: string[];
};

type CuratedGraph = {
  concepts: CuratedConcept[];
  nodes: CuratedNode[];
};

type GraphSources = {
  curated: CuratedGraph;
};

export type StoredPublicGraphNode = {
  id: string;
  key: string;
  projectId: string | null;
  entryId: string | null;
  label: string;
  labelOverride: string | null;
  kind: PublicGraphNodeType | "oss";
  href: string | null;
  body: string;
  summaryOverride: string | null;
  state: "suggested" | "public" | "hidden";
  pinned: boolean;
};

export type StoredPublicGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: PublicGraphEdge["kind"];
  state: "suggested" | "public" | "hidden";
};

type PublicGraphRepository = {
  listPublicGraphNodes: () => Promise<StoredPublicGraphNode[]>;
  listPublicGraphEdges: () => Promise<StoredPublicGraphEdge[]>;
};

type PublicGraphReaderDependencies = {
  databaseUrl: () => string | undefined;
  getRepository: () => PublicGraphRepository;
};

function nonempty(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function projectHref(project: PublicProject) {
  return `/work#${project.slug}`;
}

function entryHref(entry: PublicEntry) {
  return `/${entry.section}/${entry.slug}`;
}

function withDegrees(
  nodes: Array<Omit<PublicGraphNode, "deg">>,
  edges: PublicGraphEdge[]
): PublicGraphData {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const publicEdges = edges.filter(
    (edge) => nodeIds.has(edge.s) && nodeIds.has(edge.t)
  );
  const degree = new Map<string, number>();
  for (const edge of publicEdges) {
    degree.set(edge.s, (degree.get(edge.s) ?? 0) + 1);
    degree.set(edge.t, (degree.get(edge.t) ?? 0) + 1);
  }
  const publicNodes = nodes
    .filter((node) => node.type !== "concept" || (degree.get(node.id) ?? 0) > 0)
    .map((node) => ({ ...node, deg: degree.get(node.id) ?? 0 }));
  const survivingIds = new Set(publicNodes.map((node) => node.id));
  return {
    nodes: publicNodes,
    edges: publicEdges.filter(
      (edge) => survivingIds.has(edge.s) && survivingIds.has(edge.t)
    ),
  };
}

export function buildPublicGraph(
  projects: PublicProject[],
  entries: PublicEntry[],
  sources: GraphSources = {
    curated: curatedGraph as CuratedGraph,
  }
): PublicGraphData {
  const nodes = new Map<string, Omit<PublicGraphNode, "deg">>();
  const edges: PublicGraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const concepts = new Map(
    sources.curated.concepts.map((concept) => [concept.id, concept])
  );
  const curatedNodes = new Map(
    sources.curated.nodes
      .filter((node) => node.type !== "oss")
      .map((node) => [node.id, node])
  );

  function addNode(node: Omit<PublicGraphNode, "deg">) {
    nodes.set(node.id, node);
  }

  function addConcept(id: string) {
    if (nodes.has(id)) return;
    const concept = concepts.get(id);
    addNode({
      id,
      label: concept?.label ?? id.replaceAll("-", " "),
      type: "concept",
      summary: null,
      href: null,
      pinned: concept?.pinned ?? false,
    });
  }

  function connectCurated(nodeId: string, slug: string) {
    for (const conceptId of curatedNodes.get(slug)?.tags ?? []) {
      addConcept(conceptId);
      const pair = [nodeId, conceptId].sort().join("~");
      if (nodeId === conceptId || edgeKeys.has(pair)) continue;
      edgeKeys.add(pair);
      edges.push({
        id: `legacy:${pair}:tag`,
        s: nodeId,
        t: conceptId,
        kind: "tag",
      });
    }
  }

  for (const project of projects) {
    const curated = curatedNodes.get(project.slug);
    const id = `project:${project.slug}`;
    addNode({
      id,
      label: project.title,
      type: "project",
      summary: nonempty(project.summary) ?? nonempty(project.bodyMarkdown),
      href: projectHref(project),
      pinned: curated?.type === "project" ? (curated.pinned ?? false) : false,
    });
    connectCurated(id, project.slug);
  }

  for (const entry of entries) {
    const curated = curatedNodes.get(entry.slug);
    const id = `entry:${entry.section}:${entry.slug}`;
    addNode({
      id,
      label: entry.title,
      type: entry.section,
      summary: nonempty(entry.summary) ?? nonempty(entry.bodyMarkdown),
      href: entryHref(entry),
      pinned: curated?.type === entry.section ? (curated.pinned ?? false) : false,
    });
    connectCurated(id, entry.slug);
  }

  return withDegrees([...nodes.values()], edges);
}

export function mergePublicGraph(
  projects: PublicProject[],
  entries: PublicEntry[],
  storedNodes: StoredPublicGraphNode[],
  storedEdges: StoredPublicGraphEdge[]
): PublicGraphData {
  const projectsById = new Map(
    projects.flatMap((project) => (project.id ? [[project.id, project]] : []))
  );
  const entriesById = new Map(
    entries.flatMap((entry) => (entry.id ? [[entry.id, entry]] : []))
  );
  const storedIdToKey = new Map<string, string>();
  const nodes: Array<Omit<PublicGraphNode, "deg">> = [];

  for (const stored of storedNodes) {
    if (stored.state !== "public" || stored.kind === "oss") continue;
    const project = stored.projectId
      ? projectsById.get(stored.projectId)
      : undefined;
    const entry = stored.entryId ? entriesById.get(stored.entryId) : undefined;
    if (stored.projectId && !project) continue;
    if (stored.entryId && !entry) continue;

    const type = project ? "project" : entry ? entry.section : stored.kind;
    const sourceLabel = project?.title ?? entry?.title ?? stored.label;
    const sourceSummary =
      project?.summary ??
      entry?.summary ??
      nonempty(stored.body);
    const href = project
      ? projectHref(project)
      : entry
        ? entryHref(entry)
        : stored.href;
    storedIdToKey.set(stored.id, stored.key);
    nodes.push({
      id: stored.key,
      label: nonempty(stored.labelOverride) ?? sourceLabel,
      type,
      summary: nonempty(stored.summaryOverride) ?? sourceSummary,
      href,
      pinned: stored.pinned,
    });
  }

  const edges = storedEdges.flatMap((edge) => {
    if (edge.state !== "public") return [];
    const source = storedIdToKey.get(edge.sourceId);
    const target = storedIdToKey.get(edge.targetId);
    if (!source || !target || source === target) return [];
    return [
      {
        id: edge.id,
        s: source,
        t: target,
        kind: edge.kind,
      },
    ];
  });

  return withDegrees(nodes, edges);
}

export function createPublicGraphReader(
  dependencies: PublicGraphReaderDependencies
) {
  return {
    async getPublicGraph(
      projects: PublicProject[],
      entries: PublicEntry[]
    ): Promise<PublicGraphData> {
      if (!dependencies.databaseUrl()?.trim()) {
        return buildPublicGraph(projects, entries);
      }
      const repository = dependencies.getRepository();
      const [nodes, edges] = await Promise.all([
        repository.listPublicGraphNodes(),
        repository.listPublicGraphEdges(),
      ]);
      return mergePublicGraph(projects, entries, nodes, edges);
    },
  };
}

const publicGraphReader = createPublicGraphReader({
  databaseUrl: () => process.env.DATABASE_URL,
  getRepository: () => createContentRepository(getDatabase()),
});

export function getPublicGraph(
  projects: PublicProject[],
  entries: PublicEntry[]
) {
  return publicGraphReader.getPublicGraph(projects, entries);
}
