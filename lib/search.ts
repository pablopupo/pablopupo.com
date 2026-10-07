import {
  getPublicEntries,
  getPublicProjects,
  type PublicEntry,
  type PublicProject,
} from "./public-content";
import { publicEntryPath, publicProjectPath } from "./site";
import { entrySeries, visibleEntryTags } from "./series";
import { scoreSearchMatch } from "./search-matching";
import { getPublicGraph, type PublicGraphData } from "./public-graph";

export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 80;

type SearchDependencies = {
  getEntries: () => Promise<PublicEntry[]>;
  getProjects: () => Promise<PublicProject[]>;
  getGraph?: typeof getPublicGraph;
};

export type SearchResult = {
  type: "entry" | "project";
  title: string;
  summary: string;
  href: string;
  section: "Writing" | "Music" | "Engineering";
  publishedAt: string;
  kind?: "Recording" | "Writing" | "Project";
};

export type SearchResponse = {
  status: "empty" | "invalid" | "ready";
  query: string;
  message: string | null;
  results: SearchResult[];
};

const defaultDependencies: SearchDependencies = {
  getEntries: () => getPublicEntries(),
  getProjects: () => getPublicProjects(),
  getGraph: getPublicGraph,
};

export function escapeSearchPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseSearchQuery(value: string | undefined) {
  const query = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!query) {
    return { status: "empty" as const, query, message: null };
  }
  if (query.length < SEARCH_QUERY_MIN_LENGTH) {
    return {
      status: "invalid" as const,
      query,
      message: `Search for at least ${SEARCH_QUERY_MIN_LENGTH} characters.`,
    };
  }
  if (query.length > SEARCH_QUERY_MAX_LENGTH) {
    return {
      status: "invalid" as const,
      query,
      message: `Keep searches to ${SEARCH_QUERY_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { status: "ready" as const, query, message: null };
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(summary: string | null, bodyMarkdown: string, query: string) {
  const paragraphs = bodyMarkdown.split(/\n\s*\n/).filter((part) => part.trim() && !/^\s*#/.test(part));
  const summaryMatches = summary && scoreSearchMatch(query, "", plainText(summary), "", "") !== undefined;
  const relevant = !summaryMatches && paragraphs.find((paragraph) => scoreSearchMatch(query, "", "", "", plainText(paragraph)) !== undefined);
  const text = plainText(relevant || summary?.trim() || paragraphs[0] || bodyMarkdown);
  if (text.length <= 180) return text;
  return `${text.slice(0, 177).replace(/\s+\S*$/, "").trimEnd()}…`;
}

function entryCandidate(query: string, entry: PublicEntry, topics = "") {
  const metadata = [
    topics,
    entry.section,
    entry.kind === "performance" ? "recording" : "writing",
    ...visibleEntryTags(entry.tags),
    entrySeries(entry)?.title,
    entry.performance?.workTitle,
    entry.performance?.composer,
    entry.performance?.venue,
    entry.performance?.notesMarkdown,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const score = scoreSearchMatch(
    query,
    entry.title,
    entry.summary ?? "",
    metadata,
    plainText(entry.bodyMarkdown)
  );
  if (score === undefined) return undefined;
  return {
    score,
    result: {
      type: "entry" as const,
      title: entry.title,
      summary: excerpt(entry.summary, entry.bodyMarkdown, query),
      href: publicEntryPath(entry.section, entry.slug),
      section:
        entry.section === "music"
          ? ("Music" as const)
          : ("Writing" as const),
      publishedAt: entry.publishedAt,
      kind: entry.kind === "performance" ? "Recording" as const : "Writing" as const,
    },
  };
}

function projectCandidate(query: string, project: PublicProject, topics = "") {
  const metadata = [
    topics,
    "engineering software project",
    project.kind,
    project.organization ?? "",
    project.startedOn ?? "",
    project.endedOn ?? "",
    ...project.technologies,
    ...project.links.flatMap((link) => [link.kind, link.label]),
  ].join(" ");
  const score = scoreSearchMatch(
    query,
    project.title,
    project.summary ?? "",
    metadata,
    plainText(project.bodyMarkdown)
  );
  if (score === undefined) return undefined;
  return {
    score,
    result: {
      type: "project" as const,
      title: project.title,
      summary: excerpt(project.summary, project.bodyMarkdown, query),
      href: publicProjectPath(project.slug),
      section: "Engineering" as const,
      publishedAt: project.publishedAt,
      kind: "Project" as const,
    },
  };
}

export async function searchPublicContent(
  value: string | undefined,
  dependencies: SearchDependencies = defaultDependencies
): Promise<SearchResponse> {
  const parsed = parseSearchQuery(value);
  if (parsed.status !== "ready") {
    return { ...parsed, results: [] };
  }

  const [entries, projects] = await Promise.all([
    dependencies.getEntries(),
    dependencies.getProjects(),
  ]);
  const graph = await dependencies.getGraph?.(projects, entries);
  const topics = graph ? linkedSearchTopics(graph) : new Map<string, string>();
  const candidates = [
    ...entries.map((entry) => entryCandidate(parsed.query, entry, topics.get(publicEntryPath(entry.section, entry.slug)))),
    ...projects.map((project) => projectCandidate(parsed.query, project, topics.get(publicProjectPath(project.slug)))),
  ].filter((candidate): candidate is NonNullable<typeof candidate> =>
    Boolean(candidate)
  );
  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      right.result.publishedAt.localeCompare(left.result.publishedAt) ||
      left.result.title.localeCompare(right.result.title)
  );
  return {
    ...parsed,
    results: candidates.map((candidate) => candidate.result),
  };
}

export function linkedSearchTopics(graph: PublicGraphData) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const topics = new Map<string, string[]>();
  for (const edge of graph.edges) {
    for (const [content, topic] of [[nodes.get(edge.s), nodes.get(edge.t)], [nodes.get(edge.t), nodes.get(edge.s)]]) {
      if (content?.href && topic?.type === "concept") {
        topics.set(content.href, [...(topics.get(content.href) ?? []), topic.label]);
      }
    }
  }
  return new Map([...topics].map(([href, labels]) => [href, labels.join(" ")]));
}
