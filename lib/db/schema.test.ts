import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  getMigrationFiles,
  PGLITE_TEST_TIMEOUT_MS,
} from "./test-database";

let sharedClient: PGlite | undefined;
let appliedMigrationCount = 0;

async function prepareDatabase(migrationCount: number) {
  if (!sharedClient) throw new Error("Test database is unavailable");
  const migrationFiles = getMigrationFiles();
  await sharedClient.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  for (const migrationFile of migrationFiles.slice(0, migrationCount)) {
    await sharedClient.exec(fs.readFileSync(migrationFile, "utf8"));
  }
  appliedMigrationCount = migrationCount;
  return sharedClient;
}

async function migratedDatabase(): Promise<PGlite | undefined> {
  const migrationCount = getMigrationFiles().length;
  if (appliedMigrationCount !== migrationCount) {
    await prepareDatabase(migrationCount);
  }
  return sharedClient;
}

beforeAll(async () => {
  sharedClient = new PGlite();
});

afterAll(async () => {
  await sharedClient?.close();
}, PGLITE_TEST_TIMEOUT_MS);

describe.sequential("content schema migrations", () => {
  it("backfills sections and tags when upgrading a Task 2 database", async () => {
    const migrationFiles = getMigrationFiles();
    expect(migrationFiles).toHaveLength(4);
    const client = await prepareDatabase(2);

    const inserted = await client.query<{ id: string; kind: string }>(
      `INSERT INTO entries (slug, kind, title, body_markdown)
       VALUES
         ('existing-note', 'note', 'Existing note', 'Note body'),
         ('existing-essay', 'essay', 'Existing essay', 'Essay body'),
         ('existing-performance', 'performance', 'Existing performance', 'Performance body')
       RETURNING id, kind`
    );
    for (const entry of inserted.rows) {
      await client.query(
        `INSERT INTO entry_revisions
           (entry_id, revision_number, slug, kind, title, body_markdown)
         VALUES ($1, 1, $2, $3::entry_kind, $4, 'Snapshot body')`,
        [entry.id, `existing-${entry.kind}`, entry.kind, `Existing ${entry.kind}`]
      );
    }

    await client.exec(fs.readFileSync(migrationFiles[2]!, "utf8"));

    const entries = await client.query<{
      kind: string;
      section: string;
      tags: string[];
    }>(`SELECT kind, section, tags FROM entries ORDER BY kind::text`);
    expect(entries.rows).toEqual([
      { kind: "essay", section: "writing", tags: [] },
      { kind: "note", section: "writing", tags: [] },
      { kind: "performance", section: "music", tags: [] },
    ]);
    const revisions = await client.query<{
      kind: string;
      section: string;
      tags: string[];
    }>(`SELECT kind, section, tags FROM entry_revisions ORDER BY kind::text`);
    expect(revisions.rows).toEqual(entries.rows);
  });

  it("backfills revision slugs when upgrading an existing database", async () => {
    const migrationFiles = getMigrationFiles();
    expect(migrationFiles).toHaveLength(4);
    const client = await prepareDatabase(1);

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO entries (slug, title, body_markdown)
       VALUES ('existing-entry', 'Existing entry', 'Body')
       RETURNING id`
    );
    await client.query(
      `INSERT INTO entry_revisions
         (entry_id, revision_number, title, body_markdown)
       VALUES
         ($1, 1, 'Existing entry', 'Body'),
         ($1, 3, 'Existing entry, revised', 'Revised body')`,
      [inserted.rows[0]!.id]
    );

    await client.exec(fs.readFileSync(migrationFiles[1]!, "utf8"));

    const revisions = await client.query<{ slug: string; revision_number: number }>(
      `SELECT slug, revision_number FROM entry_revisions ORDER BY revision_number`
    );
    expect(revisions.rows).toEqual([
      { slug: "existing-entry", revision_number: 1 },
      { slug: "existing-entry", revision_number: 3 },
    ]);
    const upgraded = await client.query<{ version: number }>(
      `SELECT version FROM entries WHERE id = $1`,
      [inserted.rows[0]!.id]
    );
    expect(upgraded.rows).toEqual([{ version: 3 }]);
  });

  it("preserves existing profile settings when applying the profile seed", async () => {
    const migrationFiles = getMigrationFiles();
    expect(migrationFiles).toHaveLength(4);
    const client = await prepareDatabase(3);
    const avatar = await client.query<{ id: string }>(
      `INSERT INTO media (storage_key, url, mime_type, alt_text)
       VALUES ('custom/avatar.jpg', '/custom/avatar.jpg', 'image/jpeg', 'Custom portrait')
       RETURNING id`
    );
    await client.query(
      `INSERT INTO site_settings
         (site_title, intro_markdown, about_markdown, contact_email, avatar_media_id)
       VALUES ('Custom title', 'Custom intro', 'Custom about', 'custom@example.com', $1)`,
      [avatar.rows[0]!.id]
    );

    await client.exec(fs.readFileSync(migrationFiles[3]!, "utf8"));

    const settings = await client.query<Record<string, unknown>>(
      `SELECT site_title, headline, location, graduation_on::text AS graduation_on, intro_markdown,
              about_markdown, contact_email, github_url, linkedin_url,
              youtube_url, avatar_media_id, resume_media_id, version
       FROM site_settings`
    );
    expect(settings.rows).toEqual([
      {
        site_title: "Custom title",
        headline: "Software Engineer, Applied AI",
        location: "Miami, Florida",
        graduation_on: "2026-12-01",
        intro_markdown: "Custom intro",
        about_markdown: "Custom about",
        contact_email: "custom@example.com",
        github_url: "https://github.com/pablopupo",
        linkedin_url: "https://linkedin.com/in/pablopupo",
        youtube_url: null,
        avatar_media_id: avatar.rows[0]!.id,
        resume_media_id: "8de31ccf-3422-497f-b1b1-9d3b61e5aa0a",
        version: 1,
      },
    ]);
  });

  it("fills absent legacy contact and avatar values from the profile seed", async () => {
    const migrationFiles = getMigrationFiles();
    expect(migrationFiles).toHaveLength(4);
    const client = await prepareDatabase(3);
    await client.exec(
      `INSERT INTO site_settings
         (site_title, intro_markdown, about_markdown)
       VALUES ('Custom title', 'Custom intro', 'Custom about')`
    );

    await client.exec(fs.readFileSync(migrationFiles[3]!, "utf8"));

    const settings = await client.query<{
      contact_email: string | null;
      avatar_media_id: string | null;
    }>(
      `SELECT contact_email, avatar_media_id
       FROM site_settings`
    );
    expect(settings.rows).toEqual([
      {
        contact_email: "pablofpupo23@gmail.com",
        avatar_media_id: "4c6dfd5f-90bf-45fd-b922-fdf2e01b45fb",
      },
    ]);
  });

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
      "account",
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
      "session",
      "site_settings",
      "user",
      "verification",
    ]);
  });

  it("creates Better Auth records and complete optimistic entry snapshots", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    const columns = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_name IN ('user', 'session', 'account', 'verification', 'entries', 'entry_revisions')
       ORDER BY table_name, ordinal_position`
    );
    const names = columns.rows.map(
      (column) => `${column.table_name}.${column.column_name}`
    );

    expect(names).toEqual(
      expect.arrayContaining([
        "user.id",
        "user.email",
        "session.token",
        "session.user_id",
        "account.account_id",
        "account.provider_id",
        "account.user_id",
        "verification.identifier",
        "verification.expires_at",
        "entries.version",
        "entry_revisions.slug",
        "entry_revisions.performance_details",
      ])
    );

    const entryVersion = columns.rows.find(
      (column) =>
        column.table_name === "entries" && column.column_name === "version"
    );
    expect(entryVersion?.data_type).toBe("integer");
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

    const settings = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM site_settings`
    );
    expect(settings.rows[0]?.count).toBe(1);
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
         (entry_id, revision_number, slug, title, body_markdown)
       VALUES ($1, 1, 'cleanup-entry', 'Cleanup', 'Original')`,
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
}, PGLITE_TEST_TIMEOUT_MS);
