import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "../db/test-database";

const now = new Date("2026-07-22T12:00:00Z");

async function createTestContext() {
  const client = await createMigratedDatabase();
  expect(client, "generated SQL migrations").toBeDefined();
  if (!client) throw new Error("Generated SQL migrations are required");
  const module = await import("./repository").catch(() => undefined);
  expect(module).toBeDefined();
  expect(module?.createAdminEntryRepository).toBeTypeOf("function");
  return {
    client,
    repository: module!.createAdminEntryRepository(drizzle(client, { schema })),
  };
}

let testContext: Awaited<ReturnType<typeof createTestContext>> | undefined;

function setup() {
  if (!testContext) throw new Error("Repository test database is unavailable");
  return testContext;
}

beforeAll(async () => {
  testContext = await createTestContext();
}, PGLITE_TEST_TIMEOUT_MS);

afterEach(async () => {
  await testContext?.client.exec("TRUNCATE TABLE entries CASCADE");
}, PGLITE_TEST_TIMEOUT_MS);

afterAll(async () => {
  await testContext?.client.close();
}, PGLITE_TEST_TIMEOUT_MS);

describe("admin entry repository", () => {
  it("preserves section and ordered tags through revisions, transitions, and duplication", async () => {
    const { client, repository } = await setup();
    const created = await repository.createDraft(
      {
        slug: "music-essay",
        title: "Music essay",
        kind: "essay",
        section: "music",
        tags: ["Chopin", "Analysis"],
        bodyMarkdown: "Draft body",
      },
      now
    );

    expect(created).toMatchObject({
      section: "music",
      tags: ["Chopin", "Analysis"],
      version: 1,
    });
    const updated = await repository.updateEntry(
      created.id,
      1,
      {
        slug: "music-essay",
        kind: "essay",
        section: "music",
        tags: ["Chopin", "Counterpoint"],
        status: "draft",
        title: "Music essay",
        summary: null,
        bodyMarkdown: "Revised body",
        publishedAt: null,
        performance: null,
      },
      new Date("2026-07-22T13:00:00Z")
    );
    const published = await repository.transitionEntry(
      created.id,
      2,
      { action: "publish" },
      new Date("2026-07-22T14:00:00Z")
    );
    const duplicated = await repository.duplicateEntry(created.id, now);

    expect(updated).toMatchObject({ section: "music", tags: ["Chopin", "Counterpoint"] });
    expect(published).toMatchObject({ section: "music", tags: ["Chopin", "Counterpoint"] });
    expect(duplicated).toMatchObject({
      slug: "music-essay-copy",
      section: "music",
      tags: ["Chopin", "Counterpoint"],
      status: "draft",
    });
    const revisions = await client.query<{
      revision_number: number;
      section: string;
      tags: string[];
    }>(
      `SELECT revision_number, section, tags
       FROM entry_revisions
       WHERE entry_id = $1
       ORDER BY revision_number`,
      [created.id]
    );
    expect(revisions.rows).toEqual([
      { revision_number: 1, section: "music", tags: ["Chopin", "Analysis"] },
      { revision_number: 2, section: "music", tags: ["Chopin", "Counterpoint"] },
      { revision_number: 3, section: "music", tags: ["Chopin", "Counterpoint"] },
    ]);
  });

  it("lists newest revisions and restores an immutable snapshot without changing publication", async () => {
    const { client, repository } = await setup();
    const created = await repository.createDraft(
      {
        slug: "revision-history",
        title: "Original title",
        kind: "essay",
        section: "writing",
        tags: ["Original"],
        bodyMarkdown: "Original body",
      },
      now
    );
    await repository.updateEntry(
      created.id,
      1,
      {
        slug: "revision-history-revised",
        kind: "essay",
        section: "music",
        tags: ["Revised"],
        status: "draft",
        title: "Revised title",
        summary: "Revised summary",
        bodyMarkdown: "Revised body",
        publishedAt: null,
        performance: null,
      },
      new Date("2026-07-22T13:00:00Z")
    );
    const publishedAt = new Date("2026-07-22T14:00:00Z");
    await repository.transitionEntry(
      created.id,
      2,
      { action: "publish" },
      publishedAt
    );

    await expect(repository.listRevisions(created.id)).resolves.toMatchObject([
      { revisionNumber: 3, status: "published", title: "Revised title" },
      { revisionNumber: 2, status: "draft", title: "Revised title" },
      { revisionNumber: 1, status: "draft", title: "Original title" },
    ]);
    await expect(repository.getRevision(created.id, 1)).resolves.toMatchObject({
      revisionNumber: 1,
      slug: "revision-history",
      section: "writing",
      tags: ["Original"],
      bodyMarkdown: "Original body",
    });

    const restored = await repository.restoreRevision(
      created.id,
      1,
      3,
      new Date("2026-07-22T15:00:00Z")
    );

    expect(restored).toMatchObject({
      slug: "revision-history",
      section: "writing",
      tags: ["Original"],
      status: "published",
      title: "Original title",
      summary: null,
      bodyMarkdown: "Original body",
      publishedAt,
      version: 4,
    });
    const history = await client.query<{
      revision_number: number;
      status: string;
      title: string;
      body_markdown: string;
    }>(
      `SELECT revision_number, status, title, body_markdown
       FROM entry_revisions
       WHERE entry_id = $1
       ORDER BY revision_number`,
      [created.id]
    );
    expect(history.rows).toEqual([
      { revision_number: 1, status: "draft", title: "Original title", body_markdown: "Original body" },
      { revision_number: 2, status: "draft", title: "Revised title", body_markdown: "Revised body" },
      { revision_number: 3, status: "published", title: "Revised title", body_markdown: "Revised body" },
      { revision_number: 4, status: "published", title: "Original title", body_markdown: "Original body" },
    ]);
    await expect(
      repository.restoreRevision(created.id, 2, 3, new Date("2026-07-22T16:00:00Z"))
    ).rejects.toMatchObject({ name: "EntryConflictError" });
    const historyAfterConflict = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM entry_revisions WHERE entry_id = $1`,
      [created.id]
    );
    expect(historyAfterConflict.rows[0]?.count).toBe(4);
  });

  it("restores performance details from a revision snapshot", async () => {
    const { client, repository } = await setup();
    const created = await repository.createDraft(
      {
        slug: "performance-history",
        title: "Performance history",
        kind: "performance",
        section: "music",
        tags: ["Chopin"],
        performance: {
          workTitle: "Etude Op. 10 No. 1",
          composer: "Frédéric Chopin",
          venue: "Home",
          performedAt: new Date("2026-07-20T15:00:00Z"),
          youtubeUrl: "https://youtu.be/M7lc1UVf-VE",
          notesMarkdown: "Original take",
        },
      },
      now
    );
    await repository.updateEntry(
      created.id,
      1,
      {
        slug: "performance-history-note",
        kind: "note",
        section: "writing",
        tags: [],
        status: "draft",
        title: "Now a note",
        summary: null,
        bodyMarkdown: "No performance",
        publishedAt: null,
        performance: null,
      },
      new Date("2026-07-22T13:00:00Z")
    );

    const restored = await repository.restoreRevision(
      created.id,
      1,
      2,
      new Date("2026-07-22T14:00:00Z")
    );

    expect(restored).toMatchObject({
      kind: "performance",
      section: "music",
      tags: ["Chopin"],
      version: 3,
      performance: {
        workTitle: "Etude Op. 10 No. 1",
        composer: "Frédéric Chopin",
        venue: "Home",
        performedAt: new Date("2026-07-20T15:00:00Z"),
        youtubeUrl: "https://youtu.be/M7lc1UVf-VE",
        notesMarkdown: "Original take",
      },
    });
    const revisions = await client.query<{
      revision_number: number;
      performance_details: { composer: string } | null;
    }>(
      `SELECT revision_number, performance_details
       FROM entry_revisions
       WHERE entry_id = $1
       ORDER BY revision_number`,
      [created.id]
    );
    expect(revisions.rows).toMatchObject([
      { revision_number: 1, performance_details: { composer: "Frédéric Chopin" } },
      { revision_number: 2, performance_details: null },
      { revision_number: 3, performance_details: { composer: "Frédéric Chopin" } },
    ]);
  });

  it("rejects an unsafe legacy revision without changing the current entry", async () => {
    const { client, repository } = await setup();
    const created = await repository.createDraft(
      {
        slug: "legacy-embed",
        title: "Legacy embed",
        bodyMarkdown:
          '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>',
      },
      now
    );
    await repository.updateEntry(
      created.id,
      1,
      {
        slug: "legacy-embed",
        kind: "note",
        section: "writing",
        tags: [],
        status: "draft",
        title: "Safe entry",
        summary: null,
        bodyMarkdown: "Safe body",
        publishedAt: null,
        performance: null,
      },
      new Date("2026-07-22T13:00:00Z")
    );

    await expect(
      repository.restoreRevision(
        created.id,
        1,
        2,
        new Date("2026-07-22T14:00:00Z")
      )
    ).rejects.toMatchObject({ name: "EntryStateError" });
    await expect(repository.getEntry(created.id)).resolves.toMatchObject({
      title: "Safe entry",
      bodyMarkdown: "Safe body",
      version: 2,
    });
    const revisions = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM entry_revisions WHERE entry_id = $1`,
      [created.id]
    );
    expect(revisions.rows[0]?.count).toBe(2);
  });

  it.each([
    ["publish", { action: "publish" }],
    [
      "schedule",
      {
        action: "schedule",
        scheduledAt: new Date("2026-08-01T12:00:00Z"),
      },
    ],
  ] as const)(
    "rejects unsafe legacy Markdown before %s without changing the entry",
    async (_, transition) => {
      const { client, repository } = await setup();
      const created = await repository.createDraft(
        {
          slug: `unsafe-${transition.action}`,
          title: `Unsafe ${transition.action}`,
          bodyMarkdown:
            '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>',
        },
        now
      );

      await expect(
        repository.transitionEntry(
          created.id,
          1,
          transition,
          new Date("2026-07-22T13:00:00Z")
        )
      ).rejects.toMatchObject({ name: "EntryStateError" });
      await expect(repository.getEntry(created.id)).resolves.toMatchObject({
        status: "draft",
        publishedAt: null,
        version: 1,
      });
      const revisions = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM entry_revisions WHERE entry_id = $1`,
        [created.id]
      );
      expect(revisions.rows[0]?.count).toBe(1);
    }
  );

  it("rejects duplicating unsafe legacy Markdown without creating a copy", async () => {
    const { client, repository } = await setup();
    const created = await repository.createDraft(
      {
        slug: "unsafe-duplicate",
        title: "Unsafe duplicate",
        bodyMarkdown:
          '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>',
      },
      now
    );

    await expect(repository.duplicateEntry(created.id, now)).rejects.toMatchObject({
      name: "EntryStateError",
    });
    await expect(repository.getEntry(created.id)).resolves.toMatchObject({
      slug: "unsafe-duplicate",
      status: "draft",
      version: 1,
    });
    const rows = await client.query<{ entries: number; revisions: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM entries) AS entries,
         (SELECT COUNT(*)::int FROM entry_revisions) AS revisions`
    );
    expect(rows.rows[0]).toEqual({ entries: 1, revisions: 1 });
  });

  it("creates private drafts with initial revisions and lists deterministic ties", async () => {
    const { client, repository } = await setup();

    const second = await repository.createDraft(
      { slug: "zeta-draft", title: "Zeta draft" },
      now
    );
    const first = await repository.createDraft(
      { slug: "alpha-draft", title: "Alpha draft" },
      now
    );

    expect(first).toMatchObject({
      slug: "alpha-draft",
      kind: "note",
      section: "writing",
      tags: [],
      status: "draft",
      title: "Alpha draft",
      bodyMarkdown: "",
      publishedAt: null,
      version: 1,
      updatedAt: now,
    });
    expect(second.status).toBe("draft");
    const listed = await repository.listEntries();
    expect(listed).toMatchObject([
      { slug: "alpha-draft", status: "draft", version: 1 },
      { slug: "zeta-draft", status: "draft", version: 1 },
    ]);
    expect(Object.keys(listed[0]!).sort()).toEqual(
      [
        "id",
        "slug",
        "kind",
        "section",
        "tags",
        "status",
        "title",
        "publishedAt",
        "updatedAt",
        "version",
      ].sort()
    );

    const revisions = await client.query<{
      slug: string;
      revision_number: number;
      status: string;
      performance_details: unknown;
    }>(
      `SELECT slug, revision_number, status, performance_details
       FROM entry_revisions
       ORDER BY slug`
    );
    expect(revisions.rows).toEqual([
      {
        slug: "alpha-draft",
        revision_number: 1,
        status: "draft",
        performance_details: null,
      },
      {
        slug: "zeta-draft",
        revision_number: 1,
        status: "draft",
        performance_details: null,
      },
    ]);
  });

  it("loads performance metadata and replaces it with a versioned revision", async () => {
    const { client, repository } = await setup();
    const created = await repository.createDraft(
      {
        slug: "chopin-etude",
        title: "Chopin Etude",
        kind: "performance",
        bodyMarkdown: "Original notes",
        performance: {
          workTitle: "Etude Op. 10 No. 1",
          composer: "Frédéric Chopin",
          venue: "Home",
          performedAt: new Date("2026-07-20T15:00:00Z"),
          youtubeUrl: "https://www.youtube.com/watch?v=original",
          notesMarkdown: "First take",
        },
      },
      now
    );

    expect(created).toMatchObject({
      kind: "performance",
      version: 1,
      performance: {
        workTitle: "Etude Op. 10 No. 1",
        composer: "Frédéric Chopin",
        venue: "Home",
        performedAt: new Date("2026-07-20T15:00:00Z"),
        youtubeUrl: "https://www.youtube.com/watch?v=original",
        notesMarkdown: "First take",
      },
    });

    await expect(repository.getEntry(created.id)).resolves.toMatchObject({
      version: 1,
      performance: {
        workTitle: "Etude Op. 10 No. 1",
        composer: "Frédéric Chopin",
        venue: "Home",
        performedAt: new Date("2026-07-20T15:00:00Z"),
      },
    });

    const updatedAt = new Date("2026-07-22T13:00:00Z");
    const updated = await repository.updateEntry(
      created.id,
      1,
      {
        slug: "chopin-etude-revised",
        kind: "performance",
        section: "music",
        tags: [],
        status: "draft",
        title: "Chopin Etude, revised",
        summary: "A cleaner take",
        bodyMarkdown: "Revised notes",
        publishedAt: null,
        performance: {
          workTitle: "Etude Op. 10 No. 1",
          composer: "Chopin",
          venue: "Studio",
          performedAt: new Date("2026-07-21T16:00:00Z"),
          youtubeUrl: "https://youtu.be/revised",
          notesMarkdown: "Second take",
        },
      },
      updatedAt
    );

    expect(updated).toMatchObject({
      slug: "chopin-etude-revised",
      title: "Chopin Etude, revised",
      version: 2,
      updatedAt,
      performance: {
        composer: "Chopin",
        venue: "Studio",
      },
    });
    const details = await client.query<{ composer: string; venue: string }>(
      `SELECT composer, venue FROM entry_music_details WHERE entry_id = $1`,
      [created.id]
    );
    expect(details.rows).toEqual([{ composer: "Chopin", venue: "Studio" }]);
    const revisions = await client.query<{
      revision_number: number;
      slug: string;
      performance_details: { composer: string };
    }>(
      `SELECT revision_number, slug, performance_details
       FROM entry_revisions
       WHERE entry_id = $1
       ORDER BY revision_number`,
      [created.id]
    );
    expect(revisions.rows).toMatchObject([
      {
        revision_number: 1,
        slug: "chopin-etude",
        performance_details: { composer: "Frédéric Chopin" },
      },
      {
        revision_number: 2,
        slug: "chopin-etude-revised",
        performance_details: { composer: "Chopin" },
      },
    ]);
  });

  it("rolls back the entry, performance details, and revision together", async () => {
    const { client, repository } = await setup();
    const created = await repository.createDraft(
      {
        slug: "rollback-performance",
        title: "Rollback performance",
        kind: "performance",
        performance: {
          workTitle: "Etude",
          composer: "Chopin",
          youtubeUrl: "https://youtu.be/original",
        },
      },
      now
    );

    await expect(
      repository.updateEntry(
        created.id,
        1,
        {
          slug: "rollback-performance",
          kind: "performance",
          section: "music",
          tags: [],
          status: "draft",
          title: "This must roll back",
          summary: null,
          bodyMarkdown: "Changed",
          publishedAt: null,
          performance: {
            workTitle: "Etude",
            composer: null as unknown as string,
            youtubeUrl: "https://youtu.be/broken",
          },
        },
        new Date("2026-07-22T14:00:00Z")
      )
    ).rejects.toThrow();

    await expect(repository.getEntry(created.id)).resolves.toMatchObject({
      title: "Rollback performance",
      bodyMarkdown: "",
      version: 1,
      performance: { composer: "Chopin" },
    });
    const revisions = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM entry_revisions WHERE entry_id = $1`,
      [created.id]
    );
    expect(revisions.rows[0]?.count).toBe(1);
  });

  it("rejects a stale version without creating another revision", async () => {
    const { client, repository } = await setup();
    const created = await repository.createDraft(
      { slug: "stale-draft", title: "Stale draft" },
      now
    );
    const mutation = {
      slug: "stale-draft",
      kind: "note" as const,
      section: "writing" as const,
      tags: [] as string[],
      status: "draft" as const,
      title: "First save wins",
      summary: null,
      bodyMarkdown: "Current body",
      publishedAt: null,
      performance: null,
    };

    await repository.updateEntry(
      created.id,
      1,
      mutation,
      new Date("2026-07-22T13:00:00Z")
    );
    const noOp = await repository.updateEntry(
      created.id,
      2,
      mutation,
      new Date("2026-07-22T13:30:00Z")
    );
    expect(noOp).toMatchObject({ version: 2, title: "First save wins" });
    await expect(
      repository.updateEntry(
        created.id,
        1,
        { ...mutation, title: "Stale overwrite" },
        new Date("2026-07-22T14:00:00Z")
      )
    ).rejects.toMatchObject({ name: "EntryConflictError" });

    await expect(repository.getEntry(created.id)).resolves.toMatchObject({
      title: "First save wins",
      version: 2,
    });
    const revisions = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM entry_revisions WHERE entry_id = $1`,
      [created.id]
    );
    expect(revisions.rows[0]?.count).toBe(2);
  });

  it("publishes, schedules, unpublishes, and archives with immutable revisions", async () => {
    const { client, repository } = await setup();
    const created = await repository.createDraft(
      { slug: "state-machine", title: "State machine" },
      now
    );
    const publishedAt = new Date("2026-07-22T13:00:00Z");
    const scheduledAt = new Date("2026-08-01T12:00:00Z");

    const published = await repository.transitionEntry(
      created.id,
      1,
      { action: "publish" },
      publishedAt
    );
    expect(published).toMatchObject({
      status: "published",
      publishedAt,
      version: 2,
    });

    const scheduled = await repository.transitionEntry(
      created.id,
      2,
      { action: "schedule", scheduledAt },
      new Date("2026-07-22T14:00:00Z")
    );
    expect(scheduled).toMatchObject({
      status: "scheduled",
      publishedAt: scheduledAt,
      version: 3,
    });

    const draft = await repository.transitionEntry(
      created.id,
      3,
      { action: "unpublish" },
      new Date("2026-07-22T15:00:00Z")
    );
    expect(draft).toMatchObject({ status: "draft", publishedAt: null, version: 4 });

    const archived = await repository.transitionEntry(
      created.id,
      4,
      { action: "archive" },
      new Date("2026-07-22T16:00:00Z")
    );
    expect(archived).toMatchObject({ status: "archived", version: 5 });

    const revisions = await client.query<{
      revision_number: number;
      status: string;
      published_at: Date | null;
    }>(
      `SELECT revision_number, status, published_at
       FROM entry_revisions
       WHERE entry_id = $1
       ORDER BY revision_number`,
      [created.id]
    );
    expect(revisions.rows).toMatchObject([
      { revision_number: 1, status: "draft", published_at: null },
      { revision_number: 2, status: "published", published_at: publishedAt },
      { revision_number: 3, status: "scheduled", published_at: scheduledAt },
      { revision_number: 4, status: "draft", published_at: null },
      { revision_number: 5, status: "archived", published_at: null },
    ]);
  });

  it("duplicates any entry as a uniquely slugged private draft", async () => {
    const { client, repository } = await setup();
    const source = await repository.createDraft(
      {
        slug: "duplicate-performance",
        title: "Duplicate performance",
        kind: "performance",
        bodyMarkdown: "Source body",
        performance: {
          workTitle: "Etude",
          composer: "Chopin",
          youtubeUrl: "https://youtu.be/source",
        },
      },
      now
    );
    await repository.transitionEntry(
      source.id,
      1,
      { action: "publish" },
      new Date("2026-07-22T13:00:00Z")
    );

    const copies = await Promise.all([
      repository.duplicateEntry(
        source.id,
        new Date("2026-07-22T14:00:00Z")
      ),
      repository.duplicateEntry(
        source.id,
        new Date("2026-07-22T15:00:00Z")
      ),
    ]);
    const [firstCopy, secondCopy] = copies.sort((left, right) =>
      left.slug.localeCompare(right.slug)
    );

    expect(firstCopy!).toMatchObject({
      slug: "duplicate-performance-copy",
      title: "Duplicate performance copy",
      status: "draft",
      publishedAt: null,
      version: 1,
      performance: { composer: "Chopin" },
    });
    expect(secondCopy!.slug).toBe("duplicate-performance-copy-2");
    const copyRevisions = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM entry_revisions
       WHERE entry_id IN ($1, $2)`,
      [firstCopy!.id, secondCopy!.id]
    );
    expect(copyRevisions.rows[0]?.count).toBe(2);
  });

  it("deletes only current draft or archived versions", async () => {
    const { client, repository } = await setup();
    const draft = await repository.createDraft(
      { slug: "delete-draft", title: "Delete draft" },
      now
    );
    await expect(repository.deleteEntry(draft.id, 1)).resolves.toBe(true);
    await expect(repository.getEntry(draft.id)).resolves.toBeUndefined();

    const published = await repository.createDraft(
      { slug: "keep-published", title: "Keep published" },
      now
    );
    await repository.transitionEntry(
      published.id,
      1,
      { action: "publish" },
      new Date("2026-07-22T13:00:00Z")
    );
    await expect(repository.deleteEntry(published.id, 2)).rejects.toMatchObject({
      name: "EntryStateError",
    });
    await repository.transitionEntry(
      published.id,
      2,
      { action: "archive" },
      new Date("2026-07-22T14:00:00Z")
    );
    await expect(repository.deleteEntry(published.id, 2)).rejects.toMatchObject({
      name: "EntryConflictError",
    });
    await expect(repository.deleteEntry(published.id, 3)).resolves.toBe(true);

    const owned = await client.query<{ entries: number; revisions: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM entries) AS entries,
         (SELECT COUNT(*)::int FROM entry_revisions) AS revisions`
    );
    expect(owned.rows[0]).toEqual({ entries: 0, revisions: 0 });
  });
});
