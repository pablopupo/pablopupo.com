import { afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createContentRepository } from "./repository";
import * as schema from "./schema";
import { createMigratedDatabase } from "./test-database";

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
});

describe("content repository public reads", () => {
  it("returns only published entries at or before now, newest first", async () => {
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

    expect(result.map((entry) => entry.slug)).toEqual(["newest", "older"]);
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

  it("does not return a draft or future entry by slug", async () => {
    const { client, repository } = await setup();
    await client.exec(
      `INSERT INTO entries (slug, status, title, body_markdown, published_at)
       VALUES
         ('visible', 'published', 'Visible', 'Body', '2026-07-20T12:00:00Z'),
         ('hidden-draft', 'draft', 'Hidden draft', 'Body', NULL),
         ('hidden-future', 'published', 'Hidden future', 'Body', '2026-08-01T12:00:00Z')`
    );
    const now = new Date("2026-07-22T12:00:00Z");

    await expect(repository.getPublishedEntry("visible", now)).resolves.toMatchObject({
      slug: "visible",
    });
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
      "tie-a",
      "tie-b",
      "third",
    ]);
  });
});
