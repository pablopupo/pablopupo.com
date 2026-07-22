import {
  getPublicEntries,
  getPublicProjects,
  type PublicEntry,
  type PublicProject,
} from "./public-content";
import { publicEntryPath, publicProjectPath } from "./site";

export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 80;

type SearchDependencies = {
  getEntries: () => Promise<PublicEntry[]>;
  getProjects: () => Promise<PublicProject[]>;
};

export type SearchResult = {
  type: "entry" | "project";
  title: string;
  summary: string;
  href: string;
  section: "Writing" | "Music" | "Work";
  publishedAt: string;
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
};

function normalizedText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

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

function excerpt(summary: string | null, bodyMarkdown: string) {
  const text = plainText(summary?.trim() || bodyMarkdown);
  if (text.length <= 180) return text;
  return `${text.slice(0, 177).trimEnd()}…`;
}

function patternsFor(query: string) {
  return normalizedText(query)
    .split(" ")
    .map((token) => new RegExp(escapeSearchPattern(token), "iu"));
}

function scoreMatch(
  query: string,
  title: string,
  summary: string,
  metadata: string,
  body: string
) {
  const normalizedQuery = normalizedText(query);
  const normalizedTitle = normalizedText(title);
  const normalizedSummary = normalizedText(summary);
  const normalizedMetadata = normalizedText(metadata);
  const normalizedBody = normalizedText(body);
  const haystack = [
    normalizedTitle,
    normalizedSummary,
    normalizedMetadata,
    normalizedBody,
  ].join(" ");
  const patterns = patternsFor(query);
  if (!patterns.every((pattern) => pattern.test(haystack))) return undefined;

  let score = 0;
  if (normalizedTitle === normalizedQuery) score += 120;
  else if (normalizedTitle.startsWith(normalizedQuery)) score += 80;
  else if (normalizedTitle.includes(normalizedQuery)) score += 60;
  for (const pattern of patterns) {
    if (pattern.test(normalizedTitle)) score += 20;
    if (pattern.test(normalizedSummary)) score += 10;
    if (pattern.test(normalizedMetadata)) score += 8;
    if (pattern.test(normalizedBody)) score += 2;
  }
  return score;
}

function entryCandidate(query: string, entry: PublicEntry) {
  const metadata = [
    ...entry.tags,
    entry.performance?.workTitle,
    entry.performance?.composer,
    entry.performance?.venue,
    entry.performance?.notesMarkdown,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const score = scoreMatch(
    query,
    entry.title,
    entry.summary ?? "",
    metadata,
    entry.bodyMarkdown
  );
  if (score === undefined) return undefined;
  return {
    score,
    result: {
      type: "entry" as const,
      title: entry.title,
      summary: excerpt(entry.summary, entry.bodyMarkdown),
      href: publicEntryPath(entry.section, entry.slug),
      section:
        entry.section === "music"
          ? ("Music" as const)
          : ("Writing" as const),
      publishedAt: entry.publishedAt,
    },
  };
}

function projectCandidate(query: string, project: PublicProject) {
  const metadata = [
    project.kind,
    project.organization ?? "",
    project.startedOn ?? "",
    project.endedOn ?? "",
    ...project.technologies,
    ...project.links.flatMap((link) => [link.kind, link.label]),
  ].join(" ");
  const score = scoreMatch(
    query,
    project.title,
    project.summary ?? "",
    metadata,
    project.bodyMarkdown
  );
  if (score === undefined) return undefined;
  return {
    score,
    result: {
      type: "project" as const,
      title: project.title,
      summary: excerpt(project.summary, project.bodyMarkdown),
      href: publicProjectPath(project.slug),
      section: "Work" as const,
      publishedAt: project.publishedAt,
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
  const candidates = [
    ...entries.map((entry) => entryCandidate(parsed.query, entry)),
    ...projects.map((project) => projectCandidate(parsed.query, project)),
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
