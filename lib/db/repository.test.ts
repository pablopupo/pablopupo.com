import { afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createContentRepository } from "./repository";
import * as schema from "./schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "./test-database";

const clients: PGlite[] = [];

async function setup() {
  const client = await createMigratedDatabase();
  expect(client, "generated SQL migrations").toBeDefined();
  if (!client) throw new Error("Generated SQL migrations are required");
  clients.push(client);
  return {
    client,
    repository: createContentRepository(drizzle(client, { schema })),
  };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
}, PGLITE_TEST_TIMEOUT_MS);

describe("content repository public reads", () => {
  it("returns published and due scheduled entries, newest first", async () => {
    const { client, repository } = await setup();
    await client.exec(
      `INSERT INTO entries (slug, kind, status, title, body_markdown, published_at)
       VALUES
         ('older', 'essay', 'published', 'Older', 'Body', '2026-07-10T12:00:00Z'),
         ('newest', 'note', 'published', 'Newest', 'Body', '2026-07-20T12:00:00Z'),
         ('future-published', 'note', 'published', 'Future', 'Body', '2026-08-01T12:00:00Z'),
         ('past-scheduled', 'essay', 'scheduled', 'Past scheduled', 'Body', '2026-07-01T12:00:00Z'),
         ('future-scheduled', 'essay', 'scheduled', 'Future scheduled', 'Body', '2026-08-01T12:00:00Z'),
         ('draft', 'essay', 'draft', 'Draft', 'Body', NULL),
         ('archived', 'essay', 'archived', 'Archived', 'Body', '2026-07-01T12:00:00Z')`
    );

    const result = await repository.listPublishedEntries(
      new Date("2026-07-22T12:00:00Z")
    );

    expect(result.map((entry) => entry.slug)).toEqual([
      "newest",
      "older",
      "past-scheduled",
    ]);
  });

  it("uses slug as a deterministic tie-breaker for entries", async () => {
    const { client, repository } = await setup();
    await client.exec(
      `INSERT INTO entries (slug, status, title, body_markdown, published_at)
       VALUES
         ('same-time-b', 'published', 'B', 'Body', '2026-07-20T12:00:00Z'),
         ('same-time-a', 'published', 'A', 'Body', '2026-07-20T12:00:00Z')`
    );

    const result = await repository.listPublishedEntries(
      new Date("2026-07-22T12:00:00Z")
    );
    expect(result.map((entry) => entry.slug)).toEqual(["same-time-a", "same-time-b"]);
  });

  it("returns due scheduled entries by slug but hides drafts and future entries", async () => {
    const { client, repository } = await setup();
    await client.exec(
      `INSERT INTO entries (slug, status, title, body_markdown, published_at)
       VALUES
         ('visible', 'published', 'Visible', 'Body', '2026-07-20T12:00:00Z'),
         ('due-scheduled', 'scheduled', 'Due scheduled', 'Body', '2026-07-21T12:00:00Z'),
         ('future-scheduled', 'scheduled', 'Future scheduled', 'Body', '2026-08-02T12:00:00Z'),
         ('hidden-draft', 'draft', 'Hidden draft', 'Body', NULL),
         ('hidden-future', 'published', 'Hidden future', 'Body', '2026-08-01T12:00:00Z')`
    );
    const now = new Date("2026-07-22T12:00:00Z");

    await expect(repository.getPublishedEntry("visible", now)).resolves.toMatchObject({
      slug: "visible",
    });
    await expect(
      repository.getPublishedEntry("due-scheduled", now)
    ).resolves.toMatchObject({ slug: "due-scheduled" });
    await expect(
      repository.getPublishedEntry("future-scheduled", now)
    ).resolves.toBeUndefined();
    await expect(repository.getPublishedEntry("hidden-draft", now)).resolves.toBeUndefined();
    await expect(repository.getPublishedEntry("hidden-future", now)).resolves.toBeUndefined();
  });

  it("sorts published projects by explicit order with deterministic ties", async () => {
    const { client, repository } = await setup();
    await client.exec(
      `INSERT INTO projects
         (slug, status, title, body_markdown, published_at, sort_order)
       VALUES
         ('third', 'published', 'Third', 'Body', '2026-07-20T12:00:00Z', 20),
         ('tie-b', 'published', 'Tie B', 'Body', '2026-07-20T12:00:00Z', 10),
         ('tie-a', 'published', 'Tie A', 'Body', '2026-07-20T12:00:00Z', 10),
         ('first', 'published', 'First', 'Body', '2026-07-10T12:00:00Z', 0),
         ('draft-project', 'draft', 'Draft', 'Body', NULL, 1),
         ('future-project', 'published', 'Future', 'Body', '2026-08-01T12:00:00Z', 2),
         ('scheduled-project', 'scheduled', 'Scheduled', 'Body', '2026-07-01T12:00:00Z', 3)`
    );

    const result = await repository.listPublishedProjects(
      new Date("2026-07-22T12:00:00Z")
    );

    expect(result.map((project) => project.slug)).toEqual([
      "first",
      "scheduled-project",
      "tie-a",
      "tie-b",
      "third",
    ]);
  });

  it("returns public non-OSS graph nodes in stable presentation order", async () => {
    const { client, repository } = await setup();
    await client.exec(
      `TRUNCATE TABLE knowledge_graph_edges, knowledge_graph_nodes CASCADE;
       INSERT INTO knowledge_graph_nodes
         (id, key, label, kind, origin, state, pinned)
       VALUES
         ('00000000-0000-4000-8000-000000000101', 'music', 'Music',
          'concept', 'manual', 'public', true),
         ('00000000-0000-4000-8000-000000000102', 'applied-ai', 'Applied AI',
          'concept', 'manual', 'public', true),
         ('00000000-0000-4000-8000-000000000103', 'zeta-project', 'Shared label',
          'project', 'automatic', 'public', false),
         ('00000000-0000-4000-8000-000000000104', 'alpha-project', 'Shared label',
          'project', 'automatic', 'public', false),
         ('00000000-0000-4000-8000-000000000105', 'hidden-concept', 'Hidden',
          'concept', 'manual', 'hidden', true),
         ('00000000-0000-4000-8000-000000000106', 'suggested-concept', 'Suggested',
          'concept', 'automatic', 'suggested', true),
         ('00000000-0000-4000-8000-000000000107', 'legacy-pr', 'Legacy PR',
          'oss', 'manual', 'public', true);`
    );

    const nodes = await repository.listPublicGraphNodes();

    expect(nodes.map((node) => node.key)).toEqual([
      "applied-ai",
      "music",
      "alpha-project",
      "zeta-project",
    ]);
  });

  it("returns only public graph edges whose endpoints are public and non-OSS", async () => {
    const { client, repository } = await setup();
    await client.exec(
      `TRUNCATE TABLE knowledge_graph_edges, knowledge_graph_nodes CASCADE;
       INSERT INTO knowledge_graph_nodes
         (id, key, label, kind, origin, state)
       VALUES
         ('00000000-0000-4000-8000-000000000201', 'applied-ai', 'Applied AI',
          'concept', 'manual', 'public'),
         ('00000000-0000-4000-8000-000000000202', 'public-project', 'Public project',
          'project', 'automatic', 'public'),
         ('00000000-0000-4000-8000-000000000203', 'hidden-project', 'Hidden project',
          'project', 'automatic', 'hidden'),
         ('00000000-0000-4000-8000-000000000204', 'legacy-pr', 'Legacy PR',
          'oss', 'manual', 'public'),
         ('00000000-0000-4000-8000-000000000205', 'suggested-topic', 'Suggested topic',
          'concept', 'automatic', 'suggested');
       INSERT INTO knowledge_graph_edges
         (id, source_id, target_id, kind, origin, state)
       VALUES
         ('00000000-0000-4000-8000-000000000211',
          '00000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000202',
          'semantic', 'manual', 'public'),
         ('00000000-0000-4000-8000-000000000212',
          '00000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000202',
          'link', 'manual', 'hidden'),
         ('00000000-0000-4000-8000-000000000213',
          '00000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000203',
          'semantic', 'manual', 'public'),
         ('00000000-0000-4000-8000-000000000214',
          '00000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000204',
          'semantic', 'manual', 'public'),
         ('00000000-0000-4000-8000-000000000215',
          '00000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000205',
          'semantic', 'manual', 'public');`
    );

    const edges = await repository.listPublicGraphEdges();

    expect(edges.map((edge) => edge.id)).toEqual([
      "00000000-0000-4000-8000-000000000211",
    ]);
  });
}, PGLITE_TEST_TIMEOUT_MS);
