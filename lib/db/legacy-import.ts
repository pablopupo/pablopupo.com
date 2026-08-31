import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  entries,
  knowledgeGraphEdges,
  knowledgeGraphNodes,
  openSourceContributions,
  projectLinks,
  projects,
  projectTechnologies,
} from "./schema";
import { entryTagsSchema } from "./validation";
import type * as schema from "./schema";

type LegacyEntry = {
  slug: string;
  kind: "essay";
  section: "writing" | "music";
  tags: string[];
  status: "draft" | "published";
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  publishedAt: Date;
};

type LegacyProject = {
  slug: string;
  kind: "project";
  status: "published";
  title: string;
  bodyMarkdown: string;
  publishedAt: Date;
  sortOrder: number;
  featured: boolean;
  technologies: string[];
  links: Array<{
    kind: "repository" | "live" | "demo" | "writeup" | "other";
    label: string;
    url: string;
    sortOrder: number;
  }>;
};

type LegacyContribution = {
  repo: string;
  pr: number;
  url: string;
  title: string;
  date: string;
  status: "open" | "merged" | "closed";
  writeup?: string;
};

type LegacyGraphNode = {
  key: string;
  label: string;
  kind: "concept" | "project" | "writing" | "music" | "oss";
  href: string | null;
  body: string;
  pinned: boolean;
  tags: string[];
};

type LegacyGraphEdge = {
  sourceKey: string;
  targetKey: string;
  kind: "tag";
  terms: string[];
};

export type LegacyContent = {
  entries: LegacyEntry[];
  projects: LegacyProject[];
  contributions: LegacyContribution[];
  graphNodes: LegacyGraphNode[];
  graphEdges: LegacyGraphEdge[];
};

const projectPublishedAt = new Date("2026-07-02T00:00:00.000Z");

const legacyProjects: LegacyProject[] = [
  {
    slug: "gradus-ad-parnassum",
    kind: "project",
    status: "published",
    title: "Gradus ad Parnassum",
    bodyMarkdown:
      "RAG over musical notation. It parses scores, annotates them the way a musician would, and answers theory questions with measure references. First corpus is the Chopin Etudes. Early days; the long game is notation-native generation grounded in retrieval.",
    publishedAt: projectPublishedAt,
    sortOrder: 0,
    featured: true,
    technologies: [],
    links: [
      {
        kind: "repository",
        label: "github",
        url: "https://github.com/pablopupo/gradus-ad-parnassum",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "kit-ai",
    kind: "project",
    status: "published",
    title: "Kit AI",
    bodyMarkdown:
      "An offline-first emergency first-aid PWA built with a hackathon team. I worked on its IndexedDB retrieval layer, online/offline text-to-speech fallback, and a related fine-tuned Llama 3.2 3B model. The model remains an experiment and is not yet wired into the app.",
    publishedAt: projectPublishedAt,
    sortOrder: 1,
    featured: true,
    technologies: ["IndexedDB", "TTS", "Llama 3"],
    links: [
      {
        kind: "repository",
        label: "github",
        url: "https://github.com/pablopupo/kit-ai",
        sortOrder: 0,
      },
      {
        kind: "live",
        label: "live",
        url: "https://kit-ai-smoky.vercel.app",
        sortOrder: 1,
      },
      {
        kind: "other",
        label: "model",
        url: "https://huggingface.co/Pablo305/llama3-medical-3b-4bit",
        sortOrder: 2,
      },
      {
        kind: "demo",
        label: "demo",
        url: "https://huggingface.co/spaces/Pablo305/offline-medical-assistant",
        sortOrder: 3,
      },
    ],
  },
  {
    slug: "nova",
    kind: "project",
    status: "published",
    title: "Nova",
    bodyMarkdown:
      "A Solana Pay invoicing app with QR payments, transaction tracking, and dashboards. It won Best Use of Solana at SwampHacks.",
    publishedAt: projectPublishedAt,
    sortOrder: 2,
    featured: true,
    technologies: ["Solana Pay"],
    links: [
      {
        kind: "repository",
        label: "github",
        url: "https://github.com/pablopupo/Nova",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "accordo",
    kind: "project",
    status: "published",
    title: "Accordo",
    bodyMarkdown:
      "A booking and payments marketplace I founded for musicians, covering bookings, contracts, and payment workflows.",
    publishedAt: projectPublishedAt,
    sortOrder: 3,
    featured: false,
    technologies: [],
    links: [],
  },
];

export function parseLegacyPost(raw: string, slug: string): LegacyEntry {
  const parsed = matter(raw);
  const tags = entryTagsSchema.parse(
    Array.isArray(parsed.data.tags) ? parsed.data.tags : []
  );
  const publishedAt = new Date(`${String(parsed.data.date)}T00:00:00.000Z`);
  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error(`Legacy post ${slug} has an invalid date`);
  }
  if (typeof parsed.data.title !== "string" || parsed.data.title.length === 0) {
    throw new Error(`Legacy post ${slug} has no title`);
  }

  return {
    slug,
    kind: "essay",
    section: tags.some((tag) => tag.toLowerCase() === "music")
      ? "music"
      : "writing",
    tags,
    status: parsed.data.draft === true ? "draft" : "published",
    title: parsed.data.title,
    summary:
      typeof parsed.data.description === "string" ? parsed.data.description : null,
    bodyMarkdown: parsed.content.trimEnd(),
    publishedAt,
  };
}

function loadEntries(root: string): LegacyEntry[] {
  const directory = path.join(root, "content", "posts");
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".mdx"))
    .sort()
    .map((file) =>
      parseLegacyPost(
        fs.readFileSync(path.join(directory, file), "utf8"),
        file.replace(/\.mdx$/, "")
      )
    );
}

function loadContributions(root: string): LegacyContribution[] {
  return JSON.parse(
    fs.readFileSync(path.join(root, "data", "contributions.json"), "utf8")
  ) as LegacyContribution[];
}

function loadGraph(root: string): {
  graphNodes: LegacyGraphNode[];
  graphEdges: LegacyGraphEdge[];
} {
  const graph = JSON.parse(
    fs.readFileSync(path.join(root, "data", "graph.json"), "utf8")
  ) as {
    concepts: Array<{
      id: string;
      label: string;
      text: string;
      pinned?: boolean;
    }>;
    nodes: Array<{
      id: string;
      label: string;
      type: LegacyGraphNode["kind"];
      href: string | null;
      text: string;
      pinned?: boolean;
      tags: string[];
    }>;
  };
  const concepts = graph.concepts.map((concept): LegacyGraphNode => ({
    key: concept.id,
    label: concept.label,
    kind: "concept",
    href: null,
    body: concept.text,
    pinned: concept.pinned ?? false,
    tags: [],
  }));
  const nodes = graph.nodes.map((node): LegacyGraphNode => ({
    key: node.id,
    label: node.label,
    kind: node.type,
    href: node.href,
    body: node.text,
    pinned: node.pinned ?? false,
    tags: node.tags,
  }));
  const graphEdges = nodes.flatMap((node) =>
    node.tags.map(
      (tag): LegacyGraphEdge => ({
        sourceKey: node.key,
        targetKey: tag,
        kind: "tag",
        terms: [],
      })
    )
  );
  return { graphNodes: [...concepts, ...nodes], graphEdges };
}

export function loadLegacyContent(root: string): LegacyContent {
  const graph = loadGraph(root);
  return {
    entries: loadEntries(root),
    projects: legacyProjects,
    contributions: loadContributions(root),
    ...graph,
  };
}

export async function importLegacyContent<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
  root: string
) {
  const content = loadLegacyContent(root);

  for (const entry of content.entries) {
    await database
      .insert(entries)
      .values(entry)
      .onConflictDoUpdate({
        target: entries.slug,
        set: {
          kind: entry.kind,
          section: entry.section,
          tags: entry.tags,
          status: entry.status,
          title: entry.title,
          summary: entry.summary,
          bodyMarkdown: entry.bodyMarkdown,
          publishedAt: entry.publishedAt,
        },
      });
  }

  for (const project of content.projects) {
    const [storedProject] = await database
      .insert(projects)
      .values({
        slug: project.slug,
        kind: project.kind,
        status: project.status,
        title: project.title,
        bodyMarkdown: project.bodyMarkdown,
        publishedAt: project.publishedAt,
        sortOrder: project.sortOrder,
        featured: project.featured,
      })
      .onConflictDoUpdate({
        target: projects.slug,
        set: {
          kind: project.kind,
          status: project.status,
          title: project.title,
          bodyMarkdown: project.bodyMarkdown,
          publishedAt: project.publishedAt,
          sortOrder: project.sortOrder,
          featured: project.featured,
        },
      })
      .returning({ id: projects.id });
    if (!storedProject) throw new Error(`Project import failed for ${project.slug}`);

    for (const [sortOrder, technology] of project.technologies.entries()) {
      await database
        .insert(projectTechnologies)
        .values({ projectId: storedProject.id, name: technology, sortOrder })
        .onConflictDoUpdate({
          target: [projectTechnologies.projectId, projectTechnologies.name],
          set: { sortOrder },
        });
    }
    for (const link of project.links) {
      await database
        .insert(projectLinks)
        .values({ projectId: storedProject.id, ...link })
        .onConflictDoUpdate({
          target: [projectLinks.projectId, projectLinks.url],
          set: { kind: link.kind, label: link.label, sortOrder: link.sortOrder },
        });
    }
  }

  for (const contribution of content.contributions) {
    await database
      .insert(openSourceContributions)
      .values({
        repo: contribution.repo,
        prNumber: contribution.pr,
        url: contribution.url,
        title: contribution.title,
        contributedAt: contribution.date,
        status: contribution.status,
        writeupMarkdown: contribution.writeup ?? null,
      })
      .onConflictDoUpdate({
        target: [openSourceContributions.repo, openSourceContributions.prNumber],
        set: {
          url: contribution.url,
          title: contribution.title,
          contributedAt: contribution.date,
          status: contribution.status,
          writeupMarkdown: contribution.writeup ?? null,
        },
      });
  }

  const graphNodeIds = new Map<string, string>();
  for (const node of content.graphNodes) {
    const [storedNode] = await database
      .insert(knowledgeGraphNodes)
      .values(node)
      .onConflictDoUpdate({
        target: knowledgeGraphNodes.key,
        set: {
          label: node.label,
          kind: node.kind,
          href: node.href,
          body: node.body,
          pinned: node.pinned,
          tags: node.tags,
        },
      })
      .returning({ id: knowledgeGraphNodes.id });
    if (!storedNode) throw new Error(`Graph node import failed for ${node.key}`);
    graphNodeIds.set(node.key, storedNode.id);
  }

  for (const edge of content.graphEdges) {
    const sourceId = graphNodeIds.get(edge.sourceKey);
    const targetId = graphNodeIds.get(edge.targetKey);
    if (!sourceId || !targetId) {
      throw new Error(`Graph edge references a missing node: ${edge.sourceKey} -> ${edge.targetKey}`);
    }
    await database
      .insert(knowledgeGraphEdges)
      .values({ sourceId, targetId, kind: edge.kind, terms: edge.terms })
      .onConflictDoUpdate({
        target: [
          knowledgeGraphEdges.sourceId,
          knowledgeGraphEdges.targetId,
          knowledgeGraphEdges.kind,
        ],
        set: { terms: edge.terms },
      });
  }

  return {
    entries: content.entries.length,
    projects: content.projects.length,
    contributions: content.contributions.length,
    graphNodes: content.graphNodes.length,
    graphEdges: content.graphEdges.length,
  };
}
