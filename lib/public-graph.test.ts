import { describe, expect, it, vi } from "vitest";
import type { PublicEntry, PublicProject } from "./public-content";
import {
  buildPublicGraph,
  createPublicGraphReader,
  mergePublicGraph,
} from "./public-graph";

const project: PublicProject = {
  id: "project-id",
  slug: "live-project",
  kind: "project",
  title: "Live project",
  organization: null,
  summary: "A retrieval system.",
  bodyMarkdown: "Published from the admin UI.",
  startedOn: null,
  endedOn: null,
  publishedAt: "2026-07-22T12:00:00.000Z",
  featured: true,
  technologies: ["TypeScript", "Retrieval"],
  links: [],
};

const writing: PublicEntry = {
  id: "writing-id",
  slug: "live-note",
  kind: "note",
  section: "writing",
  tags: ["Evaluation"],
  title: "Live note",
  summary: null,
  bodyMarkdown: "A published technical note.",
  publishedAt: "2026-07-22T12:00:00.000Z",
  readMinutes: 1,
  performance: null,
};

const music: PublicEntry = {
  ...writing,
  id: "music-id",
  slug: "live-performance",
  kind: "performance",
  section: "music",
  tags: ["Piano"],
  title: "Live performance",
};

describe("legacy public graph", () => {
  it("uses authored work and connected curated concepts without publishing synthetic or raw tags", () => {
    const graph = buildPublicGraph([project], [writing, music], {
      curated: {
        concepts: [
          { id: "retrieval", label: "Retrieval" },
          { id: "piano", label: "Piano" },
          { id: "music", label: "Music" },
          { id: "unreferenced", label: "Unreferenced" },
        ],
        nodes: [
          {
            id: "live-project",
            label: "Old title",
            type: "project",
            href: null,
            pinned: true,
            tags: ["retrieval"],
          },
          {
            id: "live-performance",
            label: "Old performance",
            type: "music",
            href: null,
            tags: ["piano", "music"],
          },
          {
            id: "source-pr",
            label: "source #1",
            type: "oss",
            href: "https://example.com/pr",
            tags: ["retrieval"],
          },
        ],
      },
    });

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "music",
          type: "concept",
          deg: 1,
        }),
        expect.objectContaining({
          id: "project:live-project",
          href: "/work#live-project",
          summary: "A retrieval system.",
          pinned: true,
        }),
        expect.objectContaining({
          id: "entry:writing:live-note",
          href: "/writing/live-note",
        }),
        expect.objectContaining({
          id: "entry:music:live-performance",
          href: "/music/live-performance",
        }),
      ])
    );
    expect(graph.nodes.some((node) => node.id === "typescript")).toBe(false);
    expect(graph.nodes.some((node) => node.id === "evaluation")).toBe(false);
    expect(graph.nodes.some((node) => node.id === "source-pr")).toBe(false);
    expect(graph.nodes.some((node) => node.id === "applied-ai")).toBe(false);
    expect(graph.nodes.some((node) => node.id === "unreferenced")).toBe(false);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          s: "project:live-project",
          t: "retrieval",
        }),
        expect.objectContaining({
          s: "entry:music:live-performance",
          t: "piano",
        }),
        expect.objectContaining({
          s: "entry:music:live-performance",
          t: "music",
        }),
      ])
    );
  });

  it("keeps curated relationships for a project with a matching slug", () => {
    const graph = buildPublicGraph([project], [], {
      curated: {
        concepts: [{ id: "inference", label: "Inference" }],
        nodes: [
          {
            id: "live-project",
            label: "Old title",
            type: "project",
            href: null,
            tags: ["inference"],
          },
        ],
      },
    });

    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        s: "project:live-project",
        t: "inference",
        kind: "tag",
      })
    );
  });

  it("publishes only the curated project anchors with human labels", () => {
    const projects = [
      ["gradus-ad-parnassum", "Gradus ad Parnassum"],
      ["kit-ai", "Kit AI"],
      ["accordo", "Accordo"],
      ["nova", "Nova"],
    ].map(([slug, title], index) => ({
      ...project,
      id: `project-${index}`,
      slug,
      title,
    }));

    const graph = buildPublicGraph(projects, []);
    const projectNodes = graph.nodes
      .filter((node) => node.type === "project")
      .map(({ id, label, pinned }) => ({ id, label, pinned }))
      .sort((left, right) => left.id.localeCompare(right.id));

    expect(projectNodes).toEqual([
      { id: "project:accordo", label: "Accordo", pinned: false },
      {
        id: "project:gradus-ad-parnassum",
        label: "Gradus ad Parnassum",
        pinned: true,
      },
      { id: "project:kit-ai", label: "Kit AI", pinned: true },
      { id: "project:nova", label: "Nova", pinned: true },
    ]);
  });

  it("publishes only the six concepts connected to the curated projects", () => {
    const projects = [
      ["gradus-ad-parnassum", "Gradus ad Parnassum"],
      ["kit-ai", "Kit AI"],
      ["accordo", "Accordo"],
      ["nova", "Nova"],
    ].map(([slug, title], index) => ({
      ...project,
      id: `project-${index}`,
      slug,
      title,
    }));

    const graph = buildPublicGraph(projects, []);
    const concepts = graph.nodes
      .filter((node) => node.type === "concept")
      .map(({ id, label }) => ({ id, label }))
      .sort((left, right) => left.id.localeCompare(right.id));

    expect(concepts).toEqual([
      { id: "emergency-medicine", label: "Emergency medicine" },
      { id: "music", label: "Music" },
      { id: "notation", label: "Musical notation" },
      { id: "on-device-ai", label: "On-device AI" },
      { id: "payments", label: "Payments" },
      { id: "retrieval", label: "Retrieval" },
    ]);
  });
});

describe("stored public graph", () => {
  it("resolves content, overrides, visibility, and database edge identifiers", () => {
    const graph = mergePublicGraph(
      [project],
      [writing, music],
      [
        {
          id: "node-ai",
          key: "applied-ai",
          projectId: null,
          entryId: null,
          label: "Applied AI",
          labelOverride: null,
          kind: "concept",
          href: null,
          body: "Useful AI systems.",
          summaryOverride: null,
          state: "public",
          pinned: true,
        },
        {
          id: "node-music",
          key: "music",
          projectId: null,
          entryId: null,
          label: "Music",
          labelOverride: null,
          kind: "concept",
          href: null,
          body: "Classical piano and musical ideas.",
          summaryOverride: null,
          state: "public",
          pinned: true,
        },
        {
          id: "node-project",
          key: "project:project-id",
          projectId: "project-id",
          entryId: null,
          label: "Stale project title",
          labelOverride: "Live system",
          kind: "project",
          href: "/old-link",
          body: "Stale summary.",
          summaryOverride: null,
          state: "public",
          pinned: false,
        },
        {
          id: "node-writing",
          key: "entry:writing-id",
          projectId: null,
          entryId: "writing-id",
          label: "Stale note",
          labelOverride: null,
          kind: "writing",
          href: "/old-note",
          body: "Stale note summary.",
          summaryOverride: "A clearer editorial summary.",
          state: "public",
          pinned: false,
        },
        {
          id: "node-notation",
          key: "notation",
          projectId: null,
          entryId: null,
          label: "Notation",
          labelOverride: null,
          kind: "concept",
          href: null,
          body: "How written music represents sound.",
          summaryOverride: null,
          state: "public",
          pinned: false,
        },
        {
          id: "node-hidden",
          key: "hidden",
          projectId: null,
          entryId: null,
          label: "Hidden",
          labelOverride: null,
          kind: "concept",
          href: null,
          body: "",
          summaryOverride: null,
          state: "hidden",
          pinned: false,
        },
        {
          id: "node-oss",
          key: "source-pr",
          projectId: null,
          entryId: null,
          label: "Source PR",
          labelOverride: null,
          kind: "oss",
          href: "https://example.com/pr",
          body: "",
          summaryOverride: null,
          state: "public",
          pinned: false,
        },
        {
          id: "node-draft",
          key: "entry:draft-id",
          projectId: null,
          entryId: "draft-id",
          label: "Draft",
          labelOverride: null,
          kind: "writing",
          href: "/writing/draft",
          body: "",
          summaryOverride: null,
          state: "public",
          pinned: false,
        },
      ],
      [
        {
          id: "edge-ai-project",
          sourceId: "node-ai",
          targetId: "node-project",
          kind: "semantic",
          state: "public",
        },
        {
          id: "edge-project-notation",
          sourceId: "node-project",
          targetId: "node-notation",
          kind: "tag",
          state: "public",
        },
        {
          id: "edge-hidden",
          sourceId: "node-project",
          targetId: "node-hidden",
          kind: "tag",
          state: "public",
        },
        {
          id: "edge-oss",
          sourceId: "node-project",
          targetId: "node-oss",
          kind: "link",
          state: "public",
        },
        {
          id: "edge-not-public",
          sourceId: "node-project",
          targetId: "node-music",
          kind: "semantic",
          state: "hidden",
        },
      ]
    );

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "project:project-id",
          label: "Live system",
          summary: "A retrieval system.",
          href: "/work#live-project",
          deg: 2,
        }),
        expect.objectContaining({
          id: "entry:writing-id",
          label: "Live note",
          summary: "A clearer editorial summary.",
          href: "/writing/live-note",
        }),
        expect.objectContaining({
          id: "notation",
          summary: "How written music represents sound.",
        }),
      ])
    );
    expect(graph.nodes.map((node) => node.id)).not.toEqual(
      expect.arrayContaining([
        "hidden",
        "source-pr",
        "entry:draft-id",
        "music",
      ])
    );
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ id: "applied-ai", deg: 1 })
    );
    expect(graph.edges).toEqual([
      {
        id: "edge-ai-project",
        s: "applied-ai",
        t: "project:project-id",
        kind: "semantic",
      },
      {
        id: "edge-project-notation",
        s: "project:project-id",
        t: "notation",
        kind: "tag",
      },
    ]);
  });

  it("uses the database repository only when a database is configured", async () => {
    const listPublicGraphNodes = vi.fn().mockResolvedValue([]);
    const listPublicGraphEdges = vi.fn().mockResolvedValue([]);
    const getRepository = vi.fn(() => ({
      listPublicGraphNodes,
      listPublicGraphEdges,
    }));
    const databaseUrl = vi
      .fn<() => string | undefined>()
      .mockReturnValueOnce(undefined)
      .mockReturnValue("postgres://example");
    const reader = createPublicGraphReader({ databaseUrl, getRepository });

    const fallback = await reader.getPublicGraph(
      [{ ...project, slug: "kit-ai", title: "Kit AI" }],
      []
    );
    const stored = await reader.getPublicGraph([project], []);

    expect(fallback.nodes).toContainEqual(
      expect.objectContaining({ id: "project:kit-ai" })
    );
    expect(stored).toEqual({ nodes: [], edges: [] });
    expect(getRepository).toHaveBeenCalledTimes(1);
    expect(listPublicGraphNodes).toHaveBeenCalledTimes(1);
    expect(listPublicGraphEdges).toHaveBeenCalledTimes(1);
  });
});
