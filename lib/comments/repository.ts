import { and, desc, eq, lt, lte, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { comments, entries } from "../db/schema";
import type * as schema from "../db/schema";

type PendingCommentInput = {
  entryId: string;
  authorName?: string;
  body: string;
};

type ModerationStatus = "pending" | "approved" | "rejected" | "spam";

export type AdminCommentStatusFilter = ModerationStatus | "all";

export type AdminCommentListOptions = {
  status: AdminCommentStatusFilter;
  limit: number;
  cursor?: string;
};

const defaultAdminPageSize = 50;
const maximumAdminPageSize = 100;
const commentCursorPattern =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export class CommentEntryUnavailableError extends Error {
  name = "CommentEntryUnavailableError";
}

function publicEntryCondition(entryId: string, now: Date) {
  return and(
    eq(entries.id, entryId),
    or(eq(entries.status, "published"), eq(entries.status, "scheduled")),
    lte(entries.publishedAt, now)
  );
}

function adminPageSize(value: number) {
  if (!Number.isFinite(value)) return defaultAdminPageSize;
  return Math.min(maximumAdminPageSize, Math.max(1, Math.trunc(value)));
}

export function decodeCommentCursor(value: string) {
  const match = commentCursorPattern.exec(value);
  if (!match) return undefined;
  const createdAt = new Date(match[1]);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== match[1]) {
    return undefined;
  }
  return { createdAt, id: match[2].toLowerCase() };
}

function encodeCommentCursor(createdAt: Date, id: string) {
  return `${createdAt.toISOString()}~${id}`;
}

export function createCommentRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>
) {
  return {
    async listApprovedComments(entryId: string, now = new Date()) {
      const rows = await database
        .select({
          entryId: entries.id,
          id: comments.id,
          authorName: comments.authorName,
          body: comments.body,
          authorReplyMarkdown: comments.authorReplyMarkdown,
          authorRepliedAt: comments.authorRepliedAt,
          createdAt: comments.createdAt,
        })
        .from(entries)
        .leftJoin(
          comments,
          and(
            eq(comments.entryId, entries.id),
            eq(comments.moderationStatus, "approved")
          )
        )
        .where(publicEntryCondition(entryId, now))
        .orderBy(desc(comments.createdAt), desc(comments.id))
        .limit(200);
      if (!rows[0]) return undefined;
      return rows
        .flatMap((row) =>
          row.id
            ? [
                {
                  id: row.id,
                  authorName: row.authorName,
                  body: row.body!,
                  authorReplyMarkdown: row.authorReplyMarkdown,
                  authorRepliedAt: row.authorRepliedAt,
                  createdAt: row.createdAt!,
                },
              ]
            : []
        )
        .reverse();
    },

    async createPendingComment(input: PendingCommentInput, now = new Date()) {
      const visibleEntry = await database
        .select({ id: entries.id })
        .from(entries)
        .where(publicEntryCondition(input.entryId, now))
        .limit(1);
      if (!visibleEntry[0]) {
        throw new CommentEntryUnavailableError(
          "Comments are unavailable for this entry"
        );
      }

      const inserted = await database
        .insert(comments)
        .values({
          entryId: input.entryId,
          authorName: input.authorName ?? null,
          body: input.body,
          moderationStatus: "pending",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: comments.id });
      return inserted[0]!;
    },

    async listComments(
      options: AdminCommentListOptions = {
        status: "pending",
        limit: defaultAdminPageSize,
      }
    ) {
      const limit = adminPageSize(options.limit);
      const cursor = options.cursor
        ? decodeCommentCursor(options.cursor)
        : undefined;
      if (options.cursor && !cursor) throw new Error("Invalid comment cursor");
      const rows = await database
        .select({
          id: comments.id,
          entryId: comments.entryId,
          entrySlug: entries.slug,
          entryTitle: entries.title,
          entrySection: entries.section,
          authorName: comments.authorName,
          body: comments.body,
          moderationStatus: comments.moderationStatus,
          authorReplyMarkdown: comments.authorReplyMarkdown,
          authorRepliedAt: comments.authorRepliedAt,
          moderatedAt: comments.moderatedAt,
          createdAt: comments.createdAt,
          updatedAt: comments.updatedAt,
        })
        .from(comments)
        .innerJoin(entries, eq(entries.id, comments.entryId))
        .where(
          and(
            options.status === "all"
              ? undefined
              : eq(comments.moderationStatus, options.status),
            cursor
              ? or(
                  lt(comments.createdAt, cursor.createdAt),
                  and(
                    eq(comments.createdAt, cursor.createdAt),
                    lt(comments.id, cursor.id)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(comments.createdAt), desc(comments.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        comments: page,
        nextCursor:
          rows.length > limit && last
            ? encodeCommentCursor(last.createdAt, last.id)
            : null,
      };
    },

    async moderateComment(
      commentId: string,
      moderationStatus: ModerationStatus,
      now = new Date()
    ) {
      const updated = await database
        .update(comments)
        .set({ moderationStatus, moderatedAt: now, updatedAt: now })
        .where(eq(comments.id, commentId))
        .returning();
      return updated[0];
    },

    async replyToComment(
      commentId: string,
      authorReplyMarkdown: string | null,
      now = new Date()
    ) {
      const updated = await database
        .update(comments)
        .set({
          authorReplyMarkdown,
          authorRepliedAt: authorReplyMarkdown === null ? null : now,
          updatedAt: now,
        })
        .where(eq(comments.id, commentId))
        .returning();
      return updated[0];
    },
  };
}
