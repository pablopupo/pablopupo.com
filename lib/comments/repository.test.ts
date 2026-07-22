import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "../db/test-database";

const clients: PGlite[] = [];
const now = new Date("2026-07-22T12:00:00Z");

async function setup() {
  const client = await createMigratedDatabase();
  expect(client, "generated SQL migrations").toBeDefined();
  if (!client) throw new Error("Generated SQL migrations are required");
  clients.push(client);
  const module = await import("./repository").catch(() => undefined);
  expect(module?.createCommentRepository).toBeTypeOf("function");
  return {
    client,
    repository: module!.createCommentRepository(drizzle(client, { schema })),
  };
}

async function insertEntry(
  client: PGlite,
  values: {
    slug: string;
    status: "draft" | "scheduled" | "published";
    publishedAt: string | null;
  }
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO entries (slug, status, title, body_markdown, published_at)
     VALUES ($1, $2, 'Entry', 'Body', $3)
     RETURNING id`,
    [values.slug, values.status, values.publishedAt]
  );
  return result.rows[0]!.id;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
}, PGLITE_TEST_TIMEOUT_MS);

describe("comment repository public reads", () => {
  it("returns only approved comments for a public entry in chronological order", async () => {
    const { client, repository } = await setup();
    const entryId = await insertEntry(client, {
      slug: "public-entry",
      status: "published",
      publishedAt: "2026-07-20T12:00:00Z",
    });
    await client.query(
      `INSERT INTO comments
         (entry_id, author_name, body, moderation_status, author_reply_markdown,
          author_replied_at, created_at, updated_at)
       VALUES
         ($1, 'Later', 'Second approved', 'approved', NULL, NULL,
          '2026-07-22T11:00:00Z', '2026-07-22T11:00:00Z'),
         ($1, NULL, 'Pending', 'pending', NULL, NULL,
          '2026-07-22T09:00:00Z', '2026-07-22T09:00:00Z'),
         ($1, 'First', 'First approved', 'approved', 'Thanks.',
          '2026-07-22T10:30:00Z', '2026-07-22T10:00:00Z', '2026-07-22T10:30:00Z')`,
      [entryId]
    );

    const result = await repository.listApprovedComments(entryId, now);

    expect(result).toMatchObject([
      {
        authorName: "First",
        body: "First approved",
        authorReplyMarkdown: "Thanks.",
      },
      {
        authorName: "Later",
        body: "Second approved",
        authorReplyMarkdown: null,
      },
    ]);
    expect(result?.[0]).not.toHaveProperty("moderationStatus");
  });

  it("creates pending comments only for published or due scheduled entries", async () => {
    const { client, repository } = await setup();
    const publishedId = await insertEntry(client, {
      slug: "published-entry",
      status: "published",
      publishedAt: "2026-07-20T12:00:00Z",
    });
    const dueId = await insertEntry(client, {
      slug: "due-entry",
      status: "scheduled",
      publishedAt: "2026-07-22T11:59:00Z",
    });
    const draftId = await insertEntry(client, {
      slug: "draft-entry",
      status: "draft",
      publishedAt: null,
    });
    const futureId = await insertEntry(client, {
      slug: "future-entry",
      status: "scheduled",
      publishedAt: "2026-07-22T12:01:00Z",
    });

    await repository.createPendingComment(
      { entryId: publishedId, authorName: "Reader", body: "Published comment" },
      now
    );
    await repository.createPendingComment(
      { entryId: dueId, body: "Due comment" },
      now
    );
    await expect(
      repository.createPendingComment(
        { entryId: draftId, body: "Draft comment" },
        now
      )
    ).rejects.toMatchObject({ name: "CommentEntryUnavailableError" });
    await expect(
      repository.createPendingComment(
        { entryId: futureId, body: "Future comment" },
        now
      )
    ).rejects.toMatchObject({ name: "CommentEntryUnavailableError" });

    const stored = await client.query<{
      author_name: string | null;
      body: string;
      moderation_status: string;
    }>(
      `SELECT author_name, body, moderation_status
       FROM comments
       ORDER BY created_at, body`
    );
    expect(stored.rows).toEqual([
      {
        author_name: null,
        body: "Due comment",
        moderation_status: "pending",
      },
      {
        author_name: "Reader",
        body: "Published comment",
        moderation_status: "pending",
      },
    ]);
  });
});

describe("comment repository owner operations", () => {
  it("lists every moderation state newest first with entry context", async () => {
    const { client, repository } = await setup();
    const entryId = await insertEntry(client, {
      slug: "moderated-entry",
      status: "published",
      publishedAt: "2026-07-20T12:00:00Z",
    });
    await client.query(
      `UPDATE entries SET title = 'Moderated entry', section = 'music' WHERE id = $1`,
      [entryId]
    );
    await client.query(
      `INSERT INTO comments
         (entry_id, author_name, body, moderation_status, created_at, updated_at)
       VALUES
         ($1, 'Older', 'Approved', 'approved',
          '2026-07-22T10:00:00Z', '2026-07-22T10:00:00Z'),
         ($1, NULL, 'Pending', 'pending',
          '2026-07-22T11:00:00Z', '2026-07-22T11:00:00Z')`,
      [entryId]
    );

    const result = await repository.listComments({
      status: "all",
      limit: 50,
    });

    expect(result.comments).toMatchObject([
      {
        entrySlug: "moderated-entry",
        entryTitle: "Moderated entry",
        entrySection: "music",
        authorName: null,
        body: "Pending",
        moderationStatus: "pending",
      },
      {
        authorName: "Older",
        body: "Approved",
        moderationStatus: "approved",
      },
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it("pages a filtered moderation queue with a stable created-at and id cursor", async () => {
    const { client, repository } = await setup();
    const entryId = await insertEntry(client, {
      slug: "moderation-pages",
      status: "published",
      publishedAt: "2026-07-20T12:00:00Z",
    });
    const pendingIds = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ];
    await client.query(
      `INSERT INTO comments
         (id, entry_id, body, moderation_status, created_at, updated_at)
       VALUES
         ($2, $1, 'Old pending', 'pending',
          '2026-07-22T10:00:00Z', '2026-07-22T10:00:00Z'),
         ($3, $1, 'Middle pending', 'pending',
          '2026-07-22T11:00:00Z', '2026-07-22T11:00:00Z'),
         ($4, $1, 'Newest pending', 'pending',
          '2026-07-22T11:00:00Z', '2026-07-22T11:00:00Z'),
         ('00000000-0000-4000-8000-000000000010', $1, 'New spam', 'spam',
          '2026-07-22T12:00:00Z', '2026-07-22T12:00:00Z')`,
      [entryId, ...pendingIds]
    );

    const first = await repository.listComments({
      status: "pending",
      limit: 2,
    });
    const second = await repository.listComments({
      status: "pending",
      limit: 2,
      cursor: first.nextCursor!,
    });

    expect(first.comments.map((comment) => comment.id)).toEqual([
      pendingIds[2],
      pendingIds[1],
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.comments.map((comment) => comment.id)).toEqual([
      pendingIds[0],
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it("caps owner comment pages at one hundred rows", async () => {
    const { client, repository } = await setup();
    const entryId = await insertEntry(client, {
      slug: "bounded-moderation-page",
      status: "published",
      publishedAt: "2026-07-20T12:00:00Z",
    });
    await client.query(
      `INSERT INTO comments (entry_id, body, moderation_status)
       SELECT $1, 'Pending ' || value, 'pending'
       FROM generate_series(1, 105) AS value`,
      [entryId]
    );

    const result = await repository.listComments({
      status: "pending",
      limit: 500,
    });

    expect(result.comments).toHaveLength(100);
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it("updates moderation status and timestamp without changing comment text", async () => {
    const { client, repository } = await setup();
    const entryId = await insertEntry(client, {
      slug: "moderation-update",
      status: "published",
      publishedAt: "2026-07-20T12:00:00Z",
    });
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO comments (entry_id, author_name, body)
       VALUES ($1, 'Reader', 'Keep this text')
       RETURNING id`,
      [entryId]
    );
    const commentId = inserted.rows[0]!.id;

    const updated = await repository.moderateComment(
      commentId,
      "approved",
      now
    );

    expect(updated).toMatchObject({
      id: commentId,
      authorName: "Reader",
      body: "Keep this text",
      moderationStatus: "approved",
      moderatedAt: now,
      updatedAt: now,
    });
    await expect(
      repository.moderateComment(
        "00000000-0000-4000-8000-000000000099",
        "spam",
        now
      )
    ).resolves.toBeUndefined();
  });

  it("sets and clears an owner Markdown reply with matching timestamps", async () => {
    const { client, repository } = await setup();
    const entryId = await insertEntry(client, {
      slug: "owner-reply",
      status: "published",
      publishedAt: "2026-07-20T12:00:00Z",
    });
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO comments (entry_id, body, moderation_status)
       VALUES ($1, 'Question', 'approved')
       RETURNING id`,
      [entryId]
    );
    const commentId = inserted.rows[0]!.id;

    await expect(
      repository.replyToComment(commentId, "**Thanks** for reading.", now)
    ).resolves.toMatchObject({
      authorReplyMarkdown: "**Thanks** for reading.",
      authorRepliedAt: now,
      updatedAt: now,
    });
    await expect(
      repository.replyToComment(
        commentId,
        null,
        new Date("2026-07-22T13:00:00Z")
      )
    ).resolves.toMatchObject({
      authorReplyMarkdown: null,
      authorRepliedAt: null,
      updatedAt: new Date("2026-07-22T13:00:00Z"),
    });
  });
});
