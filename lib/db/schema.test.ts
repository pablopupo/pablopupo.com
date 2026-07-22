import { afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDatabase, getMigrationFiles } from "./test-database";

const clients: PGlite[] = [];

async function migratedDatabase(): Promise<PGlite | undefined> {
  const client = await createMigratedDatabase();
  if (client) clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("content schema migrations", () => {
  it("creates every approved content table from generated SQL", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    const result = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    );

    expect(result.rows.map((row) => row.table_name)).toEqual([
      "analytics_daily_aggregates",
      "analytics_events",
      "comments",
      "entries",
      "entry_music_details",
      "entry_revisions",
      "knowledge_graph_edges",
      "knowledge_graph_nodes",
      "media",
      "open_source_contributions",
      "project_links",
      "project_technologies",
      "projects",
      "site_settings",
    ]);
  });

  it("uses UUID defaults, timezone-aware timestamps, enums, and useful indexes", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    const timestamps = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name IN ('created_at', 'updated_at', 'published_at', 'occurred_at')`
    );
    expect(timestamps.rows).not.toHaveLength(0);
    expect(
      timestamps.rows.every((column) => column.data_type === "timestamp with time zone")
    ).toBe(true);

    const enums = await client.query<{ enum_name: string; enum_value: string }>(
      `SELECT types.typname AS enum_name, enums.enumlabel AS enum_value
       FROM pg_type AS types
       JOIN pg_enum AS enums ON enums.enumtypid = types.oid
       ORDER BY types.typname, enums.enumsortorder`
    );
    expect(enums.rows).toEqual(
      expect.arrayContaining([
        { enum_name: "content_status", enum_value: "scheduled" },
        { enum_name: "entry_kind", enum_value: "performance" },
        { enum_name: "project_kind", enum_value: "experience" },
        { enum_name: "comment_moderation_status", enum_value: "approved" },
      ])
    );

    const inserted = await client.query<{
      id: string;
      kind: string;
      status: string;
      created_at: Date;
    }>(
      `INSERT INTO entries (slug, title, body_markdown)
       VALUES ('default-entry', 'Default entry', 'Body')
       RETURNING id, kind, status, created_at`
    );
    expect(inserted.rows[0]).toMatchObject({ kind: "note", status: "draft" });
    expect(inserted.rows[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(inserted.rows[0]?.created_at).toBeInstanceOf(Date);

    const indexes = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "entries_publication_idx",
        "projects_publication_order_idx",
        "comments_moderation_created_idx",
        "analytics_events_occurred_idx",
      ])
    );
  });

  it("enforces singleton settings and repository plus PR uniqueness", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    await client.exec(
      `INSERT INTO site_settings (site_title, intro_markdown)
       VALUES ('Pablo Pupo', 'First')`
    );
    await expect(
      client.exec(
        `INSERT INTO site_settings (site_title, intro_markdown)
         VALUES ('Another site', 'Second')`
      )
    ).rejects.toThrow();

    await client.exec(
      `INSERT INTO open_source_contributions
         (repo, pr_number, url, title, contributed_at, status)
       VALUES
         ('example/repo', 42, 'https://github.com/example/repo/pull/42', 'First', '2026-07-01', 'open')`
    );
    await expect(
      client.exec(
        `INSERT INTO open_source_contributions
           (repo, pr_number, url, title, contributed_at, status)
         VALUES
           ('example/repo', 42, 'https://github.com/example/repo/pull/43', 'Duplicate', '2026-07-02', 'closed')`
      )
    ).rejects.toThrow();
  });

  it("cascades owned records and preserves entries when shared media is deleted", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    const media = await client.query<{ id: string }>(
      `INSERT INTO media (storage_key, url, mime_type)
       VALUES ('covers/test.webp', 'https://example.com/test.webp', 'image/webp')
       RETURNING id`
    );
    const entry = await client.query<{ id: string }>(
      `INSERT INTO entries
         (slug, kind, status, title, body_markdown, cover_media_id, published_at)
       VALUES
         ('cleanup-entry', 'performance', 'published', 'Cleanup', 'Body', $1, '2026-07-01T12:00:00Z')
       RETURNING id`,
      [media.rows[0]?.id]
    );
    const entryId = entry.rows[0]?.id;

    await client.query(
      `INSERT INTO entry_music_details
         (entry_id, work_title, composer, youtube_url)
       VALUES ($1, 'Etude', 'Chopin', 'https://www.youtube.com/watch?v=test')`,
      [entryId]
    );
    await client.query(
      `INSERT INTO entry_revisions
         (entry_id, revision_number, title, body_markdown)
       VALUES ($1, 1, 'Cleanup', 'Original')`,
      [entryId]
    );
    await client.query(
      `INSERT INTO comments (entry_id, body)
       VALUES ($1, 'A comment')`,
      [entryId]
    );

    await client.query(`DELETE FROM media WHERE id = $1`, [media.rows[0]?.id]);
    const retained = await client.query<{ cover_media_id: string | null }>(
      `SELECT cover_media_id FROM entries WHERE id = $1`,
      [entryId]
    );
    expect(retained.rows[0]?.cover_media_id).toBeNull();

    await client.query(`DELETE FROM entries WHERE id = $1`, [entryId]);
    const owned = await client.query<{ music: number; revisions: number; comments: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM entry_music_details) AS music,
         (SELECT COUNT(*)::int FROM entry_revisions) AS revisions,
         (SELECT COUNT(*)::int FROM comments) AS comments`
    );
    expect(owned.rows[0]).toEqual({ music: 0, revisions: 0, comments: 0 });
  });

  it("stores analytics without a raw visitor IP column", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'analytics_events'`
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["event_name", "path", "occurred_at", "properties"])
    );
    expect(columns.rows.some((row) => /(^|_)ip(_|$)/i.test(row.column_name))).toBe(false);
  });

  it("uses UUID session identifiers for analytics events", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    const sessionColumn = await client.query<{ data_type: string }>(
      `SELECT data_type
       FROM information_schema.columns
       WHERE table_name = 'analytics_events' AND column_name = 'session_id'`
    );
    expect(sessionColumn.rows[0]?.data_type).toBe("uuid");
  });

  it.each([
    '{"ip":"203.0.113.10"}',
    '{"request":{"ip":"203.0.113.10"}}',
    '{"networkAddress":"203.0.113.10"}',
    '{"deviceModel":"example"}',
    '{"viewportWidth":"1920"}',
  ])("rejects non-allowlisted analytics properties %s", async (properties) => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    await expect(
      client.query(
        `INSERT INTO analytics_events (event_name, path, properties)
         VALUES ('page_view', '/', $1::jsonb)`,
        [properties]
      )
    ).rejects.toThrow();
  });

  it("accepts only typed first-party analytics properties", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    const result = await client.query<{ properties: Record<string, unknown> }>(
      `INSERT INTO analytics_events (event_name, path, properties)
       VALUES (
         'page_view',
         '/writing',
         '{"viewportWidth":1440,"viewportHeight":900,"language":"en-US","timezone":"America/New_York","utmSource":"newsletter"}'::jsonb
       )
       RETURNING properties`
    );
    expect(result.rows[0]?.properties).toEqual({
      viewportWidth: 1440,
      viewportHeight: 900,
      language: "en-US",
      timezone: "America/New_York",
      utmSource: "newsletter",
    });
  });
});
