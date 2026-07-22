import { describe, expect, it } from "vitest";
import type { PublicEntry, PublicProject } from "./public-content";
import { buildPublicGraph } from "./public-graph";

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

describe("public graph", () => {
  it("replaces stale authored nodes with the current public database content", () => {
    const graph = buildPublicGraph([project], [writing, music], {
      generated: {
        nodes: [
          { id: "stale-project", label: "Stale", type: "project", href: null, deg: 1 },
          { id: "source-pr", label: "source #1", type: "oss", href: "https://example.com/pr", deg: 1 },
          { id: "retrieval", label: "retrieval", type: "concept", href: null, deg: 2 },
        ],
        edges: [
          { s: "source-pr", t: "retrieval", kind: "tag" },
          { s: "stale-project", t: "retrieval", kind: "tag" },
        ],
      },
      curated: {
        concepts: [
          { id: "retrieval", label: "retrieval" },
          { id: "piano", label: "piano" },
        ],
        nodes: [],
      },
    });

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "project:live-project", href: "/work#live-project" }),
        expect.objectContaining({ id: "entry:writing:live-note", href: "/writing/live-note" }),
        expect.objectContaining({ id: "entry:music:live-performance", href: "/music/live-performance" }),
        expect.objectContaining({ id: "source-pr", type: "oss" }),
        expect.objectContaining({ id: "typescript", type: "concept" }),
      ])
    );
    expect(graph.nodes.some((node) => node.id === "stale-project")).toBe(false);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ s: "project:live-project", t: "retrieval" }),
        expect.objectContaining({ s: "project:live-project", t: "typescript" }),
        expect.objectContaining({ s: "entry:writing:live-note", t: "evaluation" }),
        expect.objectContaining({ s: "entry:music:live-performance", t: "piano" }),
      ])
    );
  });

  it("keeps curated relationships for a project with a matching slug", () => {
    const graph = buildPublicGraph([project], [], {
      generated: { nodes: [], edges: [] },
      curated: {
        concepts: [{ id: "inference", label: "inference" }],
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

    expect(graph.edges).toContainEqual({
      s: "project:live-project",
      t: "inference",
      kind: "tag",
    });
  });
});
