import { describe, expect, it, vi } from "vitest";

const now = new Date("2026-07-22T12:00:00.000Z");

function databaseRepository(overrides: Record<string, unknown> = {}) {
  return {
    listPublishedEntries: vi.fn().mockResolvedValue([]),
    getPublishedEntry: vi.fn().mockResolvedValue(undefined),
    listEntryPerformanceDetails: vi.fn().mockResolvedValue([]),
    listPublishedProjects: vi.fn().mockResolvedValue([]),
    listProjectTechnologies: vi.fn().mockResolvedValue([]),
    listProjectLinks: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

async function moduleUnderTest() {
  const module = await import("./public-content").catch(() => undefined);
  expect(module?.createPublicContentReader).toBeTypeOf("function");
  expect(module?.getPublicEntries).toBeTypeOf("function");
  expect(module?.getPublicEntry).toBeTypeOf("function");
  expect(module?.getPublicProjects).toBeTypeOf("function");
  return module!;
}

describe("public content reader", () => {
  it("normalizes legacy entries and projects without opening the database", async () => {
    const module = await moduleUnderTest();
    const getRepository = vi.fn();
    const getLegacyPosts = vi.fn().mockReturnValue([
      {
        slug: "legacy-note",
        title: "Legacy note",
        date: "2026-07-10",
        description: "Legacy summary",
        tags: ["Music", "piano"],
        content: "Legacy body",
        readMinutes: 2,
      },
    ]);
    const getLegacyProjects = vi.fn().mockReturnValue([
      {
        slug: "legacy-project",
        title: "Legacy project",
        bodyMarkdown: "Project body",
        publishedAt: new Date("2026-07-02T00:00:00.000Z"),
        technologies: ["TypeScript"],
        links: [
          {
            kind: "repository",
            label: "GitHub",
            url: "https://github.com/pablopupo/example",
            sortOrder: 0,
          },
        ],
      },
    ]);
    const reader = module.createPublicContentReader({
      databaseUrl: () => undefined,
      getLegacyPosts,
      getLegacyProjects,
      getRepository,
    });

    await expect(reader.getPublicEntries(now)).resolves.toEqual([
      {
        id: null,
        slug: "legacy-note",
        kind: "essay",
        section: "music",
        tags: ["Music", "piano"],
        title: "Legacy note",
        summary: "Legacy summary",
        bodyMarkdown: "Legacy body",
        publishedAt: "2026-07-10T00:00:00.000Z",
        readMinutes: 2,
        performance: null,
      },
    ]);
    await expect(reader.getPublicEntry("legacy-note", now)).resolves.toMatchObject({
      slug: "legacy-note",
      section: "music",
    });
    await expect(reader.getPublicEntry("missing", now)).resolves.toBeUndefined();
    await expect(reader.getPublicProjects(now)).resolves.toEqual([
      {
        id: null,
        slug: "legacy-project",
        kind: "project",
        title: "Legacy project",
        organization: null,
        summary: null,
        bodyMarkdown: "Project body",
        startedOn: null,
        endedOn: null,
        publishedAt: "2026-07-02T00:00:00.000Z",
        featured: false,
        technologies: ["TypeScript"],
        links: [
          {
            kind: "repository",
            label: "GitHub",
            url: "https://github.com/pablopupo/example",
          },
        ],
      },
    ]);
    expect(getLegacyPosts).toHaveBeenCalledTimes(3);
    expect(getLegacyProjects).toHaveBeenCalledTimes(1);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it("normalizes database entries and fetches all performance details once", async () => {
    const module = await moduleUnderTest();
    const repository = databaseRepository({
      listPublishedEntries: vi.fn().mockResolvedValue([
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "piano-performance",
          kind: "performance",
          section: "music",
          tags: ["piano"],
          title: "Chopin Etude",
          summary: null,
          bodyMarkdown: "Performance notes",
          publishedAt: new Date("2026-07-21T14:00:00.000Z"),
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          slug: "systems-note",
          kind: "note",
          section: "writing",
          tags: ["systems"],
          title: "Systems note",
          summary: "A note",
          bodyMarkdown: "One two three",
          publishedAt: new Date("2026-07-20T14:00:00.000Z"),
        },
      ]),
      listEntryPerformanceDetails: vi.fn().mockResolvedValue([
        {
          entryId: "11111111-1111-4111-8111-111111111111",
          workTitle: "Etude Op. 10 No. 4",
          composer: "Frédéric Chopin",
          venue: null,
          performedAt: new Date("2026-07-19T18:30:00.000Z"),
          youtubeUrl: "https://youtu.be/M7lc1UVf-VE",
          notesMarkdown: "Fast and clear.",
        },
      ]),
    });
    const reader = module.createPublicContentReader({
      databaseUrl: () => "postgres://configured",
      getLegacyPosts: vi.fn(),
      getLegacyProjects: vi.fn(),
      getRepository: () => repository,
    });

    const result = await reader.getPublicEntries(now);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      slug: "piano-performance",
      publishedAt: "2026-07-21T14:00:00.000Z",
      performance: {
        workTitle: "Etude Op. 10 No. 4",
        performedAt: "2026-07-19T18:30:00.000Z",
      },
    });
    expect(result[1]).toMatchObject({
      slug: "systems-note",
      readMinutes: 1,
      performance: null,
    });
    expect(repository.listPublishedEntries).toHaveBeenCalledWith(now);
    expect(repository.listEntryPerformanceDetails).toHaveBeenCalledTimes(1);
    expect(repository.listEntryPerformanceDetails).toHaveBeenCalledWith([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("loads one database entry and its performance details", async () => {
    const module = await moduleUnderTest();
    const entry = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "one-entry",
      kind: "essay",
      section: "writing",
      tags: [],
      title: "One entry",
      summary: null,
      bodyMarkdown: "Body",
      publishedAt: new Date("2026-07-20T12:00:00.000Z"),
    };
    const repository = databaseRepository({
      getPublishedEntry: vi.fn().mockResolvedValue(entry),
    });
    const reader = module.createPublicContentReader({
      databaseUrl: () => "postgres://configured",
      getLegacyPosts: vi.fn(),
      getLegacyProjects: vi.fn(),
      getRepository: () => repository,
    });

    await expect(reader.getPublicEntry("one-entry", now)).resolves.toMatchObject({
      id: entry.id,
      slug: "one-entry",
      performance: null,
    });
    expect(repository.getPublishedEntry).toHaveBeenCalledWith("one-entry", now);
    expect(repository.listEntryPerformanceDetails).toHaveBeenCalledWith([
      entry.id,
    ]);
  });

  it("does not fetch performance details when a database entry is missing", async () => {
    const module = await moduleUnderTest();
    const repository = databaseRepository();
    const reader = module.createPublicContentReader({
      databaseUrl: () => "postgres://configured",
      getLegacyPosts: vi.fn(),
      getLegacyProjects: vi.fn(),
      getRepository: () => repository,
    });

    await expect(reader.getPublicEntry("missing", now)).resolves.toBeUndefined();
    expect(repository.listEntryPerformanceDetails).not.toHaveBeenCalled();
  });

  it("normalizes database projects with two bounded detail queries", async () => {
    const module = await moduleUnderTest();
    const firstId = "11111111-1111-4111-8111-111111111111";
    const secondId = "22222222-2222-4222-8222-222222222222";
    const repository = databaseRepository({
      listPublishedProjects: vi.fn().mockResolvedValue([
        {
          id: firstId,
          slug: "first",
          kind: "experience",
          title: "First",
          organization: "Example Lab",
          summary: "First project",
          bodyMarkdown: "First body",
          startedOn: "2025-06-01",
          endedOn: null,
          publishedAt: new Date("2026-07-20T12:00:00.000Z"),
          featured: true,
        },
        {
          id: secondId,
          slug: "second",
          kind: "project",
          title: "Second",
          organization: null,
          summary: null,
          bodyMarkdown: "Second body",
          startedOn: null,
          endedOn: null,
          publishedAt: new Date("2026-07-19T12:00:00.000Z"),
          featured: false,
        },
      ]),
      listProjectTechnologies: vi.fn().mockResolvedValue([
        { projectId: firstId, name: "TypeScript" },
        { projectId: firstId, name: "Postgres" },
      ]),
      listProjectLinks: vi.fn().mockResolvedValue([
        {
          projectId: secondId,
          kind: "live",
          label: "Live",
          url: "https://example.com",
        },
      ]),
    });
    const reader = module.createPublicContentReader({
      databaseUrl: () => "postgres://configured",
      getLegacyPosts: vi.fn(),
      getLegacyProjects: vi.fn(),
      getRepository: () => repository,
    });

    await expect(reader.getPublicProjects(now)).resolves.toEqual([
      {
        id: firstId,
        slug: "first",
        kind: "experience",
        title: "First",
        organization: "Example Lab",
        summary: "First project",
        bodyMarkdown: "First body",
        startedOn: "2025-06-01",
        endedOn: null,
        publishedAt: "2026-07-20T12:00:00.000Z",
        featured: true,
        technologies: ["TypeScript", "Postgres"],
        links: [],
      },
      {
        id: secondId,
        slug: "second",
        kind: "project",
        title: "Second",
        organization: null,
        summary: null,
        bodyMarkdown: "Second body",
        startedOn: null,
        endedOn: null,
        publishedAt: "2026-07-19T12:00:00.000Z",
        featured: false,
        technologies: [],
        links: [
          {
            kind: "live",
            label: "Live",
            url: "https://example.com",
          },
        ],
      },
    ]);
    expect(repository.listPublishedProjects).toHaveBeenCalledWith(now);
    expect(repository.listProjectTechnologies).toHaveBeenCalledWith([
      firstId,
      secondId,
    ]);
    expect(repository.listProjectLinks).toHaveBeenCalledWith([
      firstId,
      secondId,
    ]);
  });

  it("propagates database errors without trying legacy content", async () => {
    const module = await moduleUnderTest();
    const failure = new Error("database unavailable");
    const repository = databaseRepository({
      listPublishedEntries: vi.fn().mockRejectedValue(failure),
    });
    const getLegacyPosts = vi.fn();
    const reader = module.createPublicContentReader({
      databaseUrl: () => "postgres://configured",
      getLegacyPosts,
      getLegacyProjects: vi.fn(),
      getRepository: () => repository,
    });

    await expect(reader.getPublicEntries(now)).rejects.toBe(failure);
    expect(getLegacyPosts).not.toHaveBeenCalled();
  });
});
