import { getDatabase } from "./db/client";
import { loadLegacyContent } from "./db/legacy-import";
import { createContentRepository } from "./db/repository";
import { getPosts, readingTime, type Post } from "./posts";

export type PublicPerformance = {
  workTitle: string;
  composer: string;
  venue: string | null;
  performedAt: string | null;
  youtubeUrl: string;
  notesMarkdown: string | null;
};

export type PublicEntry = {
  id: string | null;
  slug: string;
  kind: "note" | "essay" | "performance";
  section: "writing" | "music";
  tags: string[];
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  publishedAt: string;
  readMinutes: number;
  performance: PublicPerformance | null;
};

type NeighborEntry = Pick<PublicEntry, "slug" | "section" | "publishedAt">;

export function entryNeighbors<T extends NeighborEntry>(
  entries: readonly T[],
  current: Pick<NeighborEntry, "slug" | "section">
) {
  const ordered = entries
    .filter((entry) => entry.section === current.section)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  const index = ordered.findIndex((entry) => entry.slug === current.slug);
  if (index === -1) return { newer: null, older: null };
  return {
    newer: ordered[index - 1] ?? null,
    older: ordered[index + 1] ?? null,
  };
}

export type PublicProjectLink = {
  kind: "repository" | "live" | "demo" | "writeup" | "other";
  label: string;
  url: string;
};

export type PublicProject = {
  id: string | null;
  slug: string;
  kind: "project" | "experience";
  title: string;
  organization: string | null;
  summary: string | null;
  bodyMarkdown: string;
  startedOn: string | null;
  endedOn: string | null;
  publishedAt: string;
  featured: boolean;
  technologies: string[];
  links: PublicProjectLink[];
};

type DatabaseEntry = {
  id: string;
  slug: string;
  kind: PublicEntry["kind"];
  section: PublicEntry["section"];
  tags: string[];
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  publishedAt: Date | string | null;
};

type DatabasePerformance = {
  entryId: string;
  workTitle: string;
  composer: string;
  venue: string | null;
  performedAt: Date | string | null;
  youtubeUrl: string;
  notesMarkdown: string | null;
};

type DatabaseProject = {
  id: string;
  slug: string;
  kind: PublicProject["kind"];
  title: string;
  organization: string | null;
  summary: string | null;
  bodyMarkdown: string;
  startedOn: string | null;
  endedOn: string | null;
  publishedAt: Date | string | null;
  featured: boolean;
};

type DatabaseProjectTechnology = {
  projectId: string;
  name: string;
};

type DatabaseProjectLink = PublicProjectLink & {
  projectId: string;
};

type PublicContentRepository = {
  listPublishedEntries: (now: Date) => Promise<DatabaseEntry[]>;
  getPublishedEntry: (
    slug: string,
    now: Date
  ) => Promise<DatabaseEntry | undefined>;
  listEntryPerformanceDetails: (
    entryIds: string[]
  ) => Promise<DatabasePerformance[]>;
  listPublishedProjects: (now: Date) => Promise<DatabaseProject[]>;
  listProjectTechnologies: (
    projectIds: string[]
  ) => Promise<DatabaseProjectTechnology[]>;
  listProjectLinks: (projectIds: string[]) => Promise<DatabaseProjectLink[]>;
};

type LegacyProject = {
  slug: string;
  title: string;
  bodyMarkdown: string;
  publishedAt: Date;
  featured: boolean;
  technologies: string[];
  links: Array<PublicProjectLink & { sortOrder: number }>;
};

type PublicContentReaderDependencies = {
  databaseUrl: () => string | undefined;
  getLegacyPosts: () => Post[];
  getLegacyProjects: () => LegacyProject[];
  getRepository: () => PublicContentRepository;
};

function requiredIsoDate(value: Date | string | null, subject: string) {
  if (value === null) throw new Error(`${subject} has no publication date`);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${subject} has an invalid publication date`);
  }
  return date.toISOString();
}

function legacyEntry(post: Post): PublicEntry {
  return {
    id: null,
    slug: post.slug,
    kind: "essay",
    section: post.tags.some((tag) => tag.toLowerCase() === "music")
      ? "music"
      : "writing",
    tags: post.tags,
    title: post.title,
    summary: post.description ?? null,
    bodyMarkdown: post.content,
    publishedAt: requiredIsoDate(
      `${post.date}T00:00:00.000Z`,
      `Legacy entry ${post.slug}`
    ),
    readMinutes: post.readMinutes,
    performance: null,
  };
}

function publicPerformance(
  performance: DatabasePerformance | undefined
): PublicPerformance | null {
  if (!performance) return null;
  return {
    workTitle: performance.workTitle,
    composer: performance.composer,
    venue: performance.venue,
    performedAt: performance.performedAt
      ? requiredIsoDate(
          performance.performedAt,
          `Performance ${performance.entryId}`
        )
      : null,
    youtubeUrl: performance.youtubeUrl,
    notesMarkdown: performance.notesMarkdown,
  };
}

function databaseEntry(
  entry: DatabaseEntry,
  performance: DatabasePerformance | undefined
): PublicEntry {
  return {
    id: entry.id,
    slug: entry.slug,
    kind: entry.kind,
    section: entry.section,
    tags: entry.tags,
    title: entry.title,
    summary: entry.summary,
    bodyMarkdown: entry.bodyMarkdown,
    publishedAt: requiredIsoDate(entry.publishedAt, `Entry ${entry.slug}`),
    readMinutes: readingTime(entry.bodyMarkdown),
    performance: publicPerformance(performance),
  };
}

function legacyProject(project: LegacyProject): PublicProject {
  return {
    id: null,
    slug: project.slug,
    kind: "project",
    title: project.title,
    organization: null,
    summary: null,
    bodyMarkdown: project.bodyMarkdown,
    startedOn: null,
    endedOn: null,
    publishedAt: requiredIsoDate(
      project.publishedAt,
      `Legacy project ${project.slug}`
    ),
    featured: project.featured,
    technologies: project.technologies,
    links: project.links.map(({ kind, label, url }) => ({ kind, label, url })),
  };
}

function groupedValues<T extends { projectId: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const values = grouped.get(row.projectId) ?? [];
    values.push(row);
    grouped.set(row.projectId, values);
  }
  return grouped;
}

export function createPublicContentReader(
  dependencies: PublicContentReaderDependencies
) {
  function databaseConfigured() {
    return Boolean(dependencies.databaseUrl()?.trim());
  }

  return {
    async getPublicEntries(now = new Date()): Promise<PublicEntry[]> {
      if (!databaseConfigured()) {
        return dependencies.getLegacyPosts().map(legacyEntry);
      }

      const repository = dependencies.getRepository();
      const entries = await repository.listPublishedEntries(now);
      if (entries.length === 0) return [];
      const performance = await repository.listEntryPerformanceDetails(
        entries.map((entry) => entry.id)
      );
      const performanceByEntry = new Map(
        performance.map((details) => [details.entryId, details])
      );
      return entries.map((entry) =>
        databaseEntry(entry, performanceByEntry.get(entry.id))
      );
    },

    async getPublicEntry(
      slug: string,
      now = new Date()
    ): Promise<PublicEntry | undefined> {
      if (!databaseConfigured()) {
        const post = dependencies
          .getLegacyPosts()
          .find((candidate) => candidate.slug === slug);
        return post ? legacyEntry(post) : undefined;
      }

      const repository = dependencies.getRepository();
      const entry = await repository.getPublishedEntry(slug, now);
      if (!entry) return undefined;
      const performance = await repository.listEntryPerformanceDetails([
        entry.id,
      ]);
      return databaseEntry(entry, performance[0]);
    },

    async getPublicProjects(now = new Date()): Promise<PublicProject[]> {
      if (!databaseConfigured()) {
        return dependencies.getLegacyProjects().map(legacyProject);
      }

      const repository = dependencies.getRepository();
      const projects = await repository.listPublishedProjects(now);
      if (projects.length === 0) return [];
      const projectIds = projects.map((project) => project.id);
      const [technologyRows, linkRows] = await Promise.all([
        repository.listProjectTechnologies(projectIds),
        repository.listProjectLinks(projectIds),
      ]);
      const technologies = groupedValues(technologyRows);
      const links = groupedValues(linkRows);

      return projects.map((project) => ({
        id: project.id,
        slug: project.slug,
        kind: project.kind,
        title: project.title,
        organization: project.organization,
        summary: project.summary,
        bodyMarkdown: project.bodyMarkdown,
        startedOn: project.startedOn,
        endedOn: project.endedOn,
        publishedAt: requiredIsoDate(
          project.publishedAt,
          `Project ${project.slug}`
        ),
        featured: project.featured,
        technologies: (technologies.get(project.id) ?? []).map(
          (technology) => technology.name
        ),
        links: (links.get(project.id) ?? []).map(({ kind, label, url }) => ({
          kind,
          label,
          url,
        })),
      }));
    },
  };
}

const publicContentReader = createPublicContentReader({
  databaseUrl: () => process.env.DATABASE_URL,
  getLegacyPosts: getPosts,
  getLegacyProjects: () => loadLegacyContent(process.cwd()).projects,
  getRepository: () => createContentRepository(getDatabase()),
});

export function getPublicEntries(now = new Date()) {
  return publicContentReader.getPublicEntries(now);
}

export function getPublicEntry(slug: string, now = new Date()) {
  return publicContentReader.getPublicEntry(slug, now);
}

export function getPublicProjects(now = new Date()) {
  return publicContentReader.getPublicProjects(now);
}
