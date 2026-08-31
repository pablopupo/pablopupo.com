import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "../db/test-database";

const createdAt = new Date("2026-07-22T12:00:00Z");

async function createTestContext() {
  const client = await createMigratedDatabase();
  expect(client, "generated SQL migrations").toBeDefined();
  if (!client) throw new Error("Generated SQL migrations are required");
  const module = await import("./project-repository").catch(() => undefined);
  expect(module).toBeDefined();
  expect(module?.createAdminProjectRepository).toBeTypeOf("function");
  return {
    client,
    repository: module!.createAdminProjectRepository(drizzle(client, { schema })),
  };
}

let testContext: Awaited<ReturnType<typeof createTestContext>> | undefined;

function setup() {
  if (!testContext) throw new Error("Project repository test database is unavailable");
  return testContext;
}

beforeAll(async () => {
  testContext = await createTestContext();
}, PGLITE_TEST_TIMEOUT_MS);

afterEach(async () => {
  await testContext?.client.exec("TRUNCATE TABLE projects CASCADE");
}, PGLITE_TEST_TIMEOUT_MS);

afterAll(async () => {
  await testContext?.client.close();
}, PGLITE_TEST_TIMEOUT_MS);

describe("admin project repository", () => {
  it("creates a draft and loads ordered technologies and links", async () => {
    const { repository } = setup();

    const created = await repository.createDraft(
      {
        slug: "ai-study-notes",
        kind: "project",
        title: "AI study notes",
        organization: null,
        summary: "A growing systems notebook.",
        bodyMarkdown: "## What I am learning",
        startedOn: "2026-07-01",
        endedOn: null,
        sortOrder: 4,
        featured: true,
        technologies: ["TypeScript", "Postgres"],
        links: [
          {
            kind: "repository",
            label: "Source",
            url: "https://github.com/pablopupo/ai-study-notes",
            sortOrder: 0,
          },
          {
            kind: "writeup",
            label: "Notes",
            url: "https://example.com/writing/ai-study-notes",
            sortOrder: 1,
          },
        ],
      },
      createdAt
    );

    expect(created).toMatchObject({
      slug: "ai-study-notes",
      status: "draft",
      publishedAt: null,
      updatedAt: createdAt,
      technologies: ["TypeScript", "Postgres"],
      links: [
        { kind: "repository", label: "Source", sortOrder: 0 },
        { kind: "writeup", label: "Notes", sortOrder: 1 },
      ],
    });
    await expect(repository.getProject(created.id)).resolves.toMatchObject(created);
    await expect(repository.listProjects()).resolves.toMatchObject([
      {
        id: created.id,
        slug: "ai-study-notes",
        status: "draft",
        title: "AI study notes",
        updatedAt: createdAt,
      },
    ]);
  });

  it("atomically replaces the project aggregate and rejects a stale update", async () => {
    const { repository } = setup();
    const created = await repository.createDraft(
      {
        slug: "runtime-lab",
        kind: "project",
        title: "Runtime lab",
        organization: null,
        summary: null,
        bodyMarkdown: "Draft",
        startedOn: null,
        endedOn: null,
        sortOrder: 0,
        featured: false,
        technologies: ["Python"],
        links: [],
      },
      createdAt
    );
    const updatedAt = new Date("2026-07-22T13:00:00Z");

    const updated = await repository.updateProject(
      created.id,
      created.updatedAt,
      {
        slug: "runtime-lab",
        kind: "project",
        status: "scheduled",
        title: "Runtime lab",
        organization: null,
        summary: "Experiments in model serving.",
        bodyMarkdown: "Scheduled body",
        startedOn: null,
        endedOn: null,
        publishedAt: new Date("2026-08-01T16:00:00Z"),
        sortOrder: 1,
        featured: true,
        technologies: ["Python", "CUDA"],
        links: [
          {
            kind: "repository",
            label: "Repository",
            url: "https://github.com/pablopupo/runtime-lab",
            sortOrder: 0,
          },
        ],
      },
      updatedAt
    );

    expect(updated).toMatchObject({
      status: "scheduled",
      updatedAt,
      technologies: ["Python", "CUDA"],
      links: [{ label: "Repository" }],
    });
    await expect(
      repository.updateProject(
        created.id,
        created.updatedAt,
        {
          ...updated,
          status: "draft",
          publishedAt: null,
          technologies: ["Stale"],
          links: [],
        },
        new Date("2026-07-22T14:00:00Z")
      )
    ).rejects.toMatchObject({ name: "ProjectConflictError" });
    await expect(repository.getProject(created.id)).resolves.toMatchObject({
      status: "scheduled",
      updatedAt,
      technologies: ["Python", "CUDA"],
      links: [{ label: "Repository" }],
    });
  });

  it("uses updatedAt to protect deletion", async () => {
    const { repository } = setup();
    const created = await repository.createDraft(
      {
        slug: "delete-me",
        kind: "project",
        title: "Delete me",
        organization: null,
        summary: null,
        bodyMarkdown: "",
        startedOn: null,
        endedOn: null,
        sortOrder: 0,
        featured: false,
        technologies: [],
        links: [],
      },
      createdAt
    );

    await expect(
      repository.deleteProject(
        created.id,
        new Date("2026-07-22T11:59:59Z")
      )
    ).rejects.toMatchObject({ name: "ProjectConflictError" });
    await expect(repository.getProject(created.id)).resolves.toBeDefined();

    await expect(
      repository.deleteProject(created.id, created.updatedAt)
    ).resolves.toBe(true);
    await expect(repository.getProject(created.id)).resolves.toBeUndefined();
    await expect(
      repository.deleteProject(created.id, created.updatedAt)
    ).rejects.toMatchObject({ name: "ProjectNotFoundError" });
  });

  it("advances the concurrency token when two writes share a clock tick", async () => {
    const { repository } = setup();
    const created = await repository.createDraft(
      {
        slug: "clock-tick",
        kind: "project",
        title: "Clock tick",
        organization: null,
        summary: null,
        bodyMarkdown: "First",
        startedOn: null,
        endedOn: null,
        sortOrder: 0,
        featured: false,
        technologies: [],
        links: [],
      },
      createdAt
    );

    const updated = await repository.updateProject(
      created.id,
      created.updatedAt,
      {
        slug: "clock-tick",
        kind: "project",
        status: "draft",
        title: "Clock tick",
        organization: null,
        summary: null,
        bodyMarkdown: "Second",
        startedOn: null,
        endedOn: null,
        publishedAt: null,
        sortOrder: 0,
        featured: false,
        technologies: [],
        links: [],
      },
      createdAt
    );

    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime()
    );
    await expect(
      repository.updateProject(
        created.id,
        created.updatedAt,
        {
          ...updated,
          bodyMarkdown: "Stale",
          technologies: [],
          links: [],
        },
        createdAt
      )
    ).rejects.toMatchObject({ name: "ProjectConflictError" });
  });

  it("accepts a millisecond token for an imported microsecond timestamp", async () => {
    const { client, repository } = setup();
    const id = "22222222-2222-4222-8222-222222222222";
    await client.query(
      `INSERT INTO projects (
         id, slug, kind, status, title, body_markdown, sort_order, featured,
         updated_at
       ) VALUES ($1, 'imported-project', 'project', 'draft', 'Imported project',
         'Imported body', 0, false, '2026-07-22T12:00:00.123456Z')`,
      [id]
    );
    const imported = await repository.getProject(id);
    expect(imported?.updatedAt.toISOString()).toBe(
      "2026-07-22T12:00:00.123Z"
    );

    await expect(
      repository.updateProject(
        id,
        imported!.updatedAt,
        {
          slug: "imported-project",
          kind: "project",
          status: "draft",
          title: "Imported project",
          organization: null,
          summary: null,
          bodyMarkdown: "Editable body",
          startedOn: null,
          endedOn: null,
          publishedAt: null,
          sortOrder: 0,
          featured: false,
          technologies: [],
          links: [],
        },
        new Date("2026-07-22T13:00:00Z")
      )
    ).resolves.toMatchObject({ bodyMarkdown: "Editable body" });
  });

  it("keeps a stable graph node synchronized with project content", async () => {
    const { client, repository } = setup();
    const created = await repository.createDraft(
      {
        slug: "living-map-project",
        kind: "project",
        title: "Living map project",
        organization: null,
        summary: "The first graph summary.",
        bodyMarkdown: "",
        startedOn: null,
        endedOn: null,
        sortOrder: 0,
        featured: false,
        technologies: ["Retrieval"],
        links: [],
      },
      createdAt
    );

    const initial = await client.query<{
      key: string;
      label: string;
      kind: string;
      href: string;
      body: string;
    }>(
      `SELECT key, label, kind, href, body
       FROM knowledge_graph_nodes
       WHERE key = $1`,
      [`project:${created.id}`]
    );
    expect(initial.rows).toEqual([
      {
        key: `project:${created.id}`,
        label: "Living map project",
        kind: "project",
        href: "/work#living-map-project",
        body: "The first graph summary.",
      },
    ]);

    await repository.updateProject(
      created.id,
      created.updatedAt,
      {
        slug: "renamed-map-project",
        kind: "project",
        status: "published",
        title: "Renamed map project",
        organization: null,
        summary: "The updated graph summary.",
        bodyMarkdown: "",
        startedOn: null,
        endedOn: null,
        publishedAt: new Date("2026-07-22T13:00:00Z"),
        sortOrder: 0,
        featured: false,
        technologies: ["Retrieval"],
        links: [],
      },
      new Date("2026-07-22T13:00:00Z")
    );

    const updated = await client.query<{
      key: string;
      label: string;
      href: string;
      body: string;
    }>(
      `SELECT key, label, href, body
       FROM knowledge_graph_nodes
       WHERE key = $1`,
      [`project:${created.id}`]
    );
    expect(updated.rows).toEqual([
      {
        key: `project:${created.id}`,
        label: "Renamed map project",
        href: "/work#renamed-map-project",
        body: "The updated graph summary.",
      },
    ]);
  });
});
