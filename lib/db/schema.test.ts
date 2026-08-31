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
    expect(migrationFiles).toHaveLength(8);
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
    expect(migrationFiles).toHaveLength(8);
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
    expect(migrationFiles).toHaveLength(8);
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
    expect(migrationFiles).toHaveLength(8);
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

  it("adds global rate-limit buckets when upgrading the existing schema", async () => {
    const migrationFiles = getMigrationFiles();
    expect(migrationFiles).toHaveLength(8);
    const client = await prepareDatabase(4);

    await client.exec(fs.readFileSync(migrationFiles[4]!, "utf8"));

    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'rate_limit_buckets'`
    );
    expect(tables.rows).toEqual([{ table_name: "rate_limit_buckets" }]);
  });

  it("updates the seeded introduction without overwriting UI-managed copy", async () => {
    const migrationFiles = getMigrationFiles();
    expect(migrationFiles).toHaveLength(8);
    let client = await prepareDatabase(5);

    await client.exec(fs.readFileSync(migrationFiles[5]!, "utf8"));

    const updated = await client.query<{
      intro_markdown: string;
      version: number;
    }>(
      `SELECT intro_markdown, version
       FROM site_settings`
    );
    expect(updated.rows).toEqual([
      {
        intro_markdown:
          "I’m an AI engineer currently building applied AI systems in healthcare. I share projects, open-source work, and technical notes, alongside classical piano performances and writing about music.",
        version: 2,
      },
    ]);

    client = await prepareDatabase(5);
    await client.exec(
      `UPDATE site_settings
       SET intro_markdown = 'Introduction saved from the UI.'`
    );
    await client.exec(fs.readFileSync(migrationFiles[5]!, "utf8"));

    const preserved = await client.query<{
      intro_markdown: string;
      version: number;
    }>(
      `SELECT intro_markdown, version
       FROM site_settings`
    );
    expect(preserved.rows).toEqual([
      {
        intro_markdown: "Introduction saved from the UI.",
        version: 1,
      },
    ]);
  });

  it("repositions the public profile without overwriting UI-managed copy", async () => {
    const migrationFiles = getMigrationFiles();
    expect(migrationFiles).toHaveLength(8);
    let client = await prepareDatabase(6);

    await client.exec(fs.readFileSync(migrationFiles[6]!, "utf8"));

    const updated = await client.query<{
      headline: string;
      intro_markdown: string;
      about_markdown: string;
      version: number;
    }>(
      `SELECT headline, intro_markdown, about_markdown, version
       FROM site_settings`
    );
    expect(updated.rows).toEqual([
      {
        headline: "AI Engineer at Handtevy",
        intro_markdown:
          "CS student at UF. AI engineer at Handtevy. Classical pianist and music enthusiast.",
        about_markdown:
          "I study computer science at the University of Florida and build applied AI systems, with a focus on document intelligence, retrieval, and evaluation. I write technical notes about what I learn. I’m also a classical pianist, and I share performances and writing about music here.",
        version: 3,
      },
    ]);

    client = await prepareDatabase(6);
    await client.exec(
      `UPDATE site_settings
       SET headline = 'Headline saved from the UI.',
           intro_markdown = 'Introduction saved from the UI.',
           about_markdown = 'About copy saved from the UI.'`
    );
    await client.exec(fs.readFileSync(migrationFiles[6]!, "utf8"));

    const preserved = await client.query<{
      headline: string;
      intro_markdown: string;
      about_markdown: string;
      version: number;
    }>(
      `SELECT headline, intro_markdown, about_markdown, version
       FROM site_settings`
    );
    expect(preserved.rows).toEqual([
      {
        headline: "Headline saved from the UI.",
        intro_markdown: "Introduction saved from the UI.",
        about_markdown: "About copy saved from the UI.",
        version: 2,
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
      "rate_limit_buckets",
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
        "rate_limit_buckets_expires_idx",
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

  it("stores only bounded HMAC rate-limit buckets", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'rate_limit_buckets'
       ORDER BY ordinal_position`
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "id",
      "scope",
      "client_key",
      "window_started_at",
      "request_count",
      "expires_at",
    ]);
    expect(columns.rows.some((row) => /(^|_)ip(_|$)/i.test(row.column_name))).toBe(
      false
    );

    const key = "a".repeat(64);
    await client.query(
      `INSERT INTO rate_limit_buckets
         (scope, client_key, window_started_at, request_count, expires_at)
       VALUES ('comments', $1, '2026-07-22T12:00:00Z', 1, '2026-07-22T12:10:00Z')`,
      [key]
    );
    await expect(
      client.query(
        `INSERT INTO rate_limit_buckets
           (scope, client_key, window_started_at, request_count, expires_at)
         VALUES ('comments', $1, '2026-07-22T12:00:00Z', 1, '2026-07-22T12:10:00Z')`,
        [key]
      )
    ).rejects.toThrow();
    await expect(
      client.query(
        `INSERT INTO rate_limit_buckets
           (scope, client_key, window_started_at, request_count, expires_at)
         VALUES ('comments', '203.0.113.4', '2026-07-22T12:00:00Z', 1, '2026-07-22T12:10:00Z')`
      )
    ).rejects.toThrow();
    await expect(
      client.query(
        `INSERT INTO rate_limit_buckets
           (scope, client_key, window_started_at, request_count, expires_at)
         VALUES ('unknown', $1, '2026-07-22T12:00:00Z', 0, '2026-07-22T11:00:00Z')`,
        ["b".repeat(64)]
      )
    ).rejects.toThrow();
  });

  it("stores editable graph state without weakening content ownership", async () => {
    expect(getMigrationFiles(), "generated SQL migrations").not.toHaveLength(0);
    const client = await migratedDatabase();
    if (!client) return;

    const nodeColumns = await client.query<{
      column_name: string;
      is_nullable: string;
    }>(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'knowledge_graph_nodes'
       ORDER BY ordinal_position`
    );
    expect(nodeColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column_name: "project_id", is_nullable: "YES" }),
        expect.objectContaining({ column_name: "entry_id", is_nullable: "YES" }),
        expect.objectContaining({ column_name: "origin", is_nullable: "NO" }),
        expect.objectContaining({ column_name: "state", is_nullable: "NO" }),
        expect.objectContaining({ column_name: "label_override", is_nullable: "YES" }),
        expect.objectContaining({ column_name: "summary_override", is_nullable: "YES" }),
        expect.objectContaining({ column_name: "pinned", is_nullable: "NO" }),
        expect.objectContaining({ column_name: "version", is_nullable: "NO" }),
      ])
    );

    const edgeColumns = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'knowledge_graph_edges'
       ORDER BY ordinal_position`
    );
    expect(edgeColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["origin", "state", "updated_at", "version"])
    );
  });

  it("upgrades existing graph content into the living map", async () => {
    const migrationFiles = getMigrationFiles();
    const client = await prepareDatabase(7);
    const project = await client.query<{ id: string }>(
      `INSERT INTO projects
         (slug, kind, status, title, body_markdown, published_at)
       VALUES
         ('existing-project', 'project', 'published', 'Existing project', '', '2026-07-22T12:00:00Z')
       RETURNING id`
    );
    const entry = await client.query<{ id: string }>(
      `INSERT INTO entries
         (slug, kind, section, status, title, body_markdown, published_at)
       VALUES
         ('existing-note', 'note', 'writing', 'published', 'Existing note', '', '2026-07-22T12:00:00Z')
       RETURNING id`
    );
    await client.query(
      `INSERT INTO knowledge_graph_nodes (key, label, kind)
       VALUES
         ('existing-project', 'Existing project', 'project'),
         ('existing-note', 'Existing note', 'writing'),
         ('docling-example', 'docling example', 'oss')`
    );

    await client.exec(fs.readFileSync(migrationFiles[7]!, "utf8"));

    const upgraded = await client.query<{
      key: string;
      project_id: string | null;
      entry_id: string | null;
      origin: string;
      state: string;
      pinned: boolean;
    }>(
      `SELECT key, project_id, entry_id, origin, state, pinned
       FROM knowledge_graph_nodes
       WHERE key IN (
         'existing-project',
         'existing-note',
         'docling-example',
         'applied-ai',
         'music'
       )
       ORDER BY key`
    );
    expect(upgraded.rows).toEqual([
      {
        key: "applied-ai",
        project_id: null,
        entry_id: null,
        origin: "manual",
        state: "public",
        pinned: true,
      },
      {
        key: "docling-example",
        project_id: null,
        entry_id: null,
        origin: "manual",
        state: "hidden",
        pinned: false,
      },
      {
        key: "existing-note",
        project_id: null,
        entry_id: entry.rows[0]!.id,
        origin: "automatic",
        state: "public",
        pinned: false,
      },
      {
        key: "existing-project",
        project_id: project.rows[0]!.id,
        entry_id: null,
        origin: "automatic",
        state: "public",
        pinned: false,
      },
      {
        key: "music",
        project_id: null,
        entry_id: null,
        origin: "manual",
        state: "public",
        pinned: true,
      },
    ]);
  });
}, PGLITE_TEST_TIMEOUT_MS);
