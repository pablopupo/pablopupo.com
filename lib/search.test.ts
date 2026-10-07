import { describe, expect, it, vi } from "vitest";
import {
  escapeSearchPattern,
  parseSearchQuery,
  searchPublicContent,
} from "./search";

const publishedAt = "2026-07-20T12:00:00.000Z";

function entry(
  overrides: Partial<{
    slug: string;
    section: "writing" | "music";
    title: string;
    summary: string | null;
    bodyMarkdown: string;
    tags: string[];
  }> = {}
) {
  return {
    id: null,
    slug: overrides.slug ?? "retrieval-notes",
    kind: "note" as const,
    section: overrides.section ?? ("writing" as const),
    tags: overrides.tags ?? ["retrieval", "evaluation"],
    title: overrides.title ?? "Applied AI retrieval notes",
    summary:
      overrides.summary === undefined
        ? "Notes on retrieval quality."
        : overrides.summary,
    bodyMarkdown: overrides.bodyMarkdown ?? "Measure retrieval and citations.",
    publishedAt,
    readMinutes: 3,
    performance: null,
  };
}

function project(
  overrides: Partial<{
    slug: string;
    title: string;
    summary: string | null;
    bodyMarkdown: string;
    technologies: string[];
  }> = {}
) {
  return {
    id: null,
    slug: overrides.slug ?? "parser",
    kind: "project" as const,
    title: overrides.title ?? "C++ [AI] parser",
    organization: null,
    summary:
      overrides.summary === undefined
        ? "A literal-pattern parser."
        : overrides.summary,
    bodyMarkdown: overrides.bodyMarkdown ?? "Parses notation safely.",
    startedOn: null,
    endedOn: null,
    publishedAt,
    featured: false,
    technologies: overrides.technologies ?? ["C++"],
    links: [],
  };
}

describe("search query parsing", () => {
  it("normalizes whitespace and enforces useful length bounds", () => {
    expect(parseSearchQuery(undefined)).toEqual({
      status: "empty",
      query: "",
      message: null,
    });
    expect(parseSearchQuery("  Applied   AI  ")).toEqual({
      status: "ready",
      query: "Applied AI",
      message: null,
    });
    expect(parseSearchQuery("a")).toMatchObject({
      status: "invalid",
      message: "Search for at least 2 characters.",
    });
    expect(parseSearchQuery("x".repeat(81))).toMatchObject({
      status: "invalid",
      message: "Keep searches to 80 characters or fewer.",
    });
  });

  it("escapes every regular-expression metacharacter", () => {
    expect(escapeSearchPattern("C++ [AI]. (test)? $5")).toBe(
      "C\\+\\+ \\[AI\\]\\. \\(test\\)\\? \\$5"
    );
  });
});

describe("public content search", () => {
  it("does not load content for an empty or invalid query", async () => {
    const dependencies = {
      getEntries: vi.fn(),
      getProjects: vi.fn(),
    };

    await expect(searchPublicContent(" ", dependencies)).resolves.toMatchObject({
      status: "empty",
      results: [],
    });
    await expect(searchPublicContent("x", dependencies)).resolves.toMatchObject({
      status: "invalid",
      results: [],
    });
    expect(dependencies.getEntries).not.toHaveBeenCalled();
    expect(dependencies.getProjects).not.toHaveBeenCalled();
  });

  it("matches literal punctuation and returns stable public links", async () => {
    const dependencies = {
      getEntries: vi.fn().mockResolvedValue([entry()]),
      getProjects: vi.fn().mockResolvedValue([project()]),
    };

    const response = await searchPublicContent("C++ [AI]", dependencies);

    expect(response).toEqual({
      status: "ready",
      query: "C++ [AI]",
      message: null,
      results: [
        {
          type: "project",
          kind: "Project",
          title: "C++ [AI] parser",
          summary: "A literal-pattern parser.",
          href: "/work/parser",
          section: "Engineering",
          publishedAt,
        },
      ],
    });
  });

  it("searches titles, summaries, bodies, tags, and technologies", async () => {
    const dependencies = {
      getEntries: vi.fn().mockResolvedValue([
        entry(),
        entry({
          slug: "chopin",
          section: "music",
          title: "Chopin practice log",
          summary: null,
          bodyMarkdown: "Voicing and phrasing.",
          tags: ["piano"],
        }),
      ]),
      getProjects: vi.fn().mockResolvedValue([
        project({
          slug: "gradus",
          title: "Gradus ad Parnassum",
          summary: null,
          bodyMarkdown: "Retrieval over musical notation.",
          technologies: ["RAG", "music"],
        }),
      ]),
    };

    const retrieval = await searchPublicContent("retrieval", dependencies);
    const piano = await searchPublicContent("piano", dependencies);

    expect(retrieval.results.map((result) => result.href)).toEqual([
      "/writing/retrieval-notes",
      "/work/gradus",
    ]);
    expect(piano.results).toMatchObject([
      {
        type: "entry",
        href: "/music/chopin",
        section: "Music",
        summary: "Voicing and phrasing.",
      },
    ]);
  });

  it("requires every normalized token and removes Markdown from excerpts", async () => {
    const dependencies = {
      getEntries: vi.fn().mockResolvedValue([
        entry({
          title: "Evaluation notebook",
          summary: null,
          bodyMarkdown: "## Applied systems\n[AI evaluation](https://example.com) notes.",
        }),
      ]),
      getProjects: vi.fn().mockResolvedValue([]),
    };

    await expect(
      searchPublicContent("applied evaluation", dependencies)
    ).resolves.toMatchObject({
      results: [
        {
          summary: "Applied systems AI evaluation notes.",
        },
      ],
    });
    await expect(
      searchPublicContent("applied missing", dependencies)
    ).resolves.toMatchObject({ results: [] });
  });

  it("preserves literal angle-bracket notation in excerpts", async () => {
    const dependencies = {
      getEntries: vi.fn().mockResolvedValue([
        entry({
          summary: null,
          bodyMarkdown: "> Compare <T> values before deployment.",
        }),
      ]),
      getProjects: vi.fn().mockResolvedValue([]),
    };

    await expect(
      searchPublicContent("deployment", dependencies)
    ).resolves.toMatchObject({
      results: [{ summary: "Compare <T> values before deployment." }],
    });
  });

  it.each(["beeth", "beethovan", "beetohven", "Beethoven sonata", "sonata by Beethoven"])("finds a recording for %s", async (query) => {
    const response = await searchPublicContent(query, {
      getEntries: async () => [entry({ slug: "beethoven", section: "music", title: "Beethoven, Sonata Op. 10 No. 2", tags: ["piano"] })],
      getProjects: async () => [],
    });
    expect(response.results.map((result) => result.href)).toEqual(["/music/beethoven"]);
  });

  it.each(["kitai", "Kit-AI", "artificial intelligence", "AI kit"])("finds a project for %s", async (query) => {
    const response = await searchPublicContent(query, {
      getEntries: async () => [],
      getProjects: async () => [project({ slug: "kit-ai", title: "Kit AI" })],
    });
    expect(response.results.map((result) => result.href)).toEqual(["/work/kit-ai"]);
  });

  it("matches accents, swapped letters, and recording vocabulary in published metadata", async () => {
    const dependencies = {
      getEntries: async () => [{ ...entry({ section: "music", title: "A short piece", tags: ["piano"] }), kind: "performance" as const, performance: {
        workTitle: "Étude", composer: "Frédéric Chopin", venue: "UF School of Music", performedAt: null, youtubeUrl: "", notesMarkdown: null,
      } }],
      getProjects: async () => [],
    };
    for (const query of ["etude", "frederic", "pianist performance", "piano recordings", "chpoin recital"]) {
      expect((await searchPublicContent(query, dependencies)).results).toHaveLength(1);
    }
  });

  it("ranks exact titles before prefixes and spelling corrections", async () => {
    const response = await searchPublicContent("Beethoven", {
      getEntries: async () => [
        entry({ slug: "typo", title: "Beethven" }),
        entry({ slug: "prefix", title: "Beethoven studies" }),
        entry({ slug: "exact", title: "Beethoven" }),
      ],
      getProjects: async () => [],
    });
    expect(response.results.map((result) => result.href)).toEqual(["/writing/exact", "/writing/prefix", "/writing/typo"]);
  });

  it("does not expand short acronyms into unrelated words or return everything for filler", async () => {
    const dependencies = {
      getEntries: async () => [entry({ title: "A chair at the piano", summary: "Practice", bodyMarkdown: "UI, painting, first aid, and the aim of playing airy music.", tags: [] })],
      getProjects: async () => [],
    };
    for (const query of ["AI", "the and", "[]", "piano spaceship", "zzzzzzzz"]) {
      expect((await searchPublicContent(query, dependencies)).results).toEqual([]);
    }
  });

  it("finds AI work described as retrieval or RAG, with exact titles first", async () => {
    const response = await searchPublicContent("AI", {
      getEntries: async () => [entry({ title: "Why I’m building Accordo", summary: "Connecting musicians.", bodyMarkdown: "My aim is to connect musicians.", tags: [] })],
      getProjects: async () => [
        project({ slug: "gradus", title: "Gradus ad Parnassum", summary: "Retrieval over musical notation.", technologies: ["RAG"] }),
        project({ slug: "kit-ai", title: "Kit AI", summary: "On-device assistance." }),
        project({ slug: "nova", title: "Nova", summary: "QR payments.", bodyMarkdown: "An invoicing app.", technologies: ["Solana"] }),
      ],
    });
    expect(response.results.map((result) => result.href)).toEqual(["/work/kit-ai", "/work/gradus"]);
  });

  it("searches published graph relationships without spreading into unrelated projects", async () => {
    const response = await searchPublicContent("orchestration", {
      getEntries: async () => [],
      getProjects: async () => [project({ slug: "gradus", title: "Gradus" }), project({ slug: "nova", title: "Nova" })],
      getGraph: async () => ({ nodes: [
        { id: "gradus", label: "Gradus", type: "project", href: "/work/gradus", summary: null, pinned: false, deg: 1 },
        { id: "topic", label: "Orchestration", type: "concept", href: null, summary: null, pinned: false, deg: 1 },
      ], edges: [{ id: "gradus-topic", s: "gradus", t: "topic", kind: "tag" }] }),
    });
    expect(response.results.map((result) => result.href)).toEqual(["/work/gradus"]);
  });

  it("shows the matching paragraph when the description does not explain the result", async () => {
    const response = await searchPublicContent("AI", {
      getEntries: async () => [entry({ summary: "Connecting musicians.", bodyMarkdown: "## Background\n\nConnecting musicians.\n\nI am exploring AI tools for musicians.", tags: [] })],
      getProjects: async () => [],
    });
    expect(response.results[0].summary).toBe("I am exploring AI tools for musicians.");
  });
});
