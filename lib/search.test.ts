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
    title: overrides.title ?? "C++ [AI] parser",
    summary:
      overrides.summary === undefined
        ? "A literal-pattern parser."
        : overrides.summary,
    bodyMarkdown: overrides.bodyMarkdown ?? "Parses notation safely.",
    publishedAt,
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
          title: "C++ [AI] parser",
          summary: "A literal-pattern parser.",
          href: "/work#parser",
          section: "Work",
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
      "/work#gradus",
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
});
