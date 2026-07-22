import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, like } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  entries,
  entryMusicDetails,
  entryRevisions,
  type EntryPerformanceDetailsSnapshot,
} from "../db/schema";
import type * as schema from "../db/schema";
import { analyzeAuthoringMarkdown } from "../markdown/youtube";

type PerformanceInput = {
  workTitle: string;
  composer: string;
  venue?: string | null;
  performedAt?: Date | null;
  youtubeUrl: string;
  notesMarkdown?: string | null;
};

type CreateDraftInput = {
  slug: string;
  title: string;
  kind?: "note" | "essay" | "performance";
  section?: "writing" | "music";
  tags?: string[];
  summary?: string | null;
  bodyMarkdown?: string;
  performance?: PerformanceInput | null;
};

type EntryMutationInput = {
  slug: string;
  kind: "note" | "essay" | "performance";
  section: "writing" | "music";
  tags: string[];
  status: "draft" | "scheduled" | "published" | "archived";
  title: string;
  summary?: string | null;
  bodyMarkdown: string;
  publishedAt?: Date | null;
  performance?: PerformanceInput | null;
};

export class EntryConflictError extends Error {
  name = "EntryConflictError";
}

export class EntryNotFoundError extends Error {
  name = "EntryNotFoundError";
}

export class EntryStateError extends Error {
  name = "EntryStateError";
}

export class RevisionNotFoundError extends Error {
  name = "RevisionNotFoundError";
}

function assertSafeMarkdown(markdown: string, subject: "Entry" | "Revision") {
  const issue = analyzeAuthoringMarkdown(markdown).issues[0];
  if (issue) {
    throw new EntryStateError(`${subject} contains unsafe Markdown: ${issue}`);
  }
}

function performanceValues(performance: PerformanceInput) {
  return {
    workTitle: performance.workTitle,
    composer: performance.composer,
    venue: performance.venue ?? null,
    performedAt: performance.performedAt ?? null,
    youtubeUrl: performance.youtubeUrl,
    notesMarkdown: performance.notesMarkdown ?? null,
  };
}

function performanceSnapshot(
  performance: PerformanceInput | null | undefined
): EntryPerformanceDetailsSnapshot | null {
  if (!performance) return null;
  return {
    workTitle: performance.workTitle,
    composer: performance.composer,
    venue: performance.venue ?? null,
    performedAt: performance.performedAt?.toISOString() ?? null,
    youtubeUrl: performance.youtubeUrl,
    notesMarkdown: performance.notesMarkdown ?? null,
  };
}

function performanceFromSnapshot(
  performance: EntryPerformanceDetailsSnapshot | null
): PerformanceInput | null {
  if (!performance) return null;
  return {
    workTitle: performance.workTitle,
    composer: performance.composer,
    venue: performance.venue,
    performedAt: performance.performedAt
      ? new Date(performance.performedAt)
      : null,
    youtubeUrl: performance.youtubeUrl,
    notesMarkdown: performance.notesMarkdown,
  };
}

function publicPerformance(
  performance: typeof entryMusicDetails.$inferSelect | null
) {
  if (!performance) return null;
  return {
    workTitle: performance.workTitle,
    composer: performance.composer,
    venue: performance.venue,
    performedAt: performance.performedAt,
    youtubeUrl: performance.youtubeUrl,
    notesMarkdown: performance.notesMarkdown,
  };
}

function datesEqual(left: Date | null | undefined, right: Date | null | undefined) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function performancesEqual(
  current: typeof entryMusicDetails.$inferSelect | null,
  next: PerformanceInput | null | undefined
) {
  if (!current || !next) return current === null && !next;
  return (
    current.workTitle === next.workTitle &&
    current.composer === next.composer &&
    current.venue === (next.venue ?? null) &&
    datesEqual(current.performedAt, next.performedAt) &&
    current.youtubeUrl === next.youtubeUrl &&
    current.notesMarkdown === (next.notesMarkdown ?? null)
  );
}

function entryMutationIsNoOp(
  current: typeof entries.$inferSelect,
  performance: typeof entryMusicDetails.$inferSelect | null,
  input: EntryMutationInput
) {
  return (
    current.slug === input.slug &&
    current.kind === input.kind &&
    current.section === input.section &&
    current.tags.length === input.tags.length &&
    current.tags.every((tag, index) => tag === input.tags[index]) &&
    current.status === input.status &&
    current.title === input.title &&
    current.summary === (input.summary ?? null) &&
    current.bodyMarkdown === input.bodyMarkdown &&
    datesEqual(current.publishedAt, input.publishedAt) &&
    performancesEqual(performance, input.performance)
  );
}

function isUniqueViolation(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object") return false;
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export function createAdminEntryRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>
) {
  return {
    async listEntries() {
      return database
        .select({
          id: entries.id,
          slug: entries.slug,
          kind: entries.kind,
          section: entries.section,
          tags: entries.tags,
          status: entries.status,
          title: entries.title,
          publishedAt: entries.publishedAt,
          updatedAt: entries.updatedAt,
          version: entries.version,
        })
        .from(entries)
        .orderBy(desc(entries.updatedAt), asc(entries.slug));
    },

    async getEntry(id: string) {
      const result = await database
        .select({ entry: entries, performance: entryMusicDetails })
        .from(entries)
        .leftJoin(entryMusicDetails, eq(entryMusicDetails.entryId, entries.id))
        .where(eq(entries.id, id))
        .limit(1);
      const row = result[0];
      if (!row) return undefined;
      return { ...row.entry, performance: publicPerformance(row.performance) };
    },

    async listRevisions(id: string) {
      return database
        .select({
          revisionNumber: entryRevisions.revisionNumber,
          status: entryRevisions.status,
          title: entryRevisions.title,
          createdAt: entryRevisions.createdAt,
        })
        .from(entryRevisions)
        .where(eq(entryRevisions.entryId, id))
        .orderBy(desc(entryRevisions.revisionNumber));
    },

    async getRevision(id: string, revisionNumber: number) {
      const result = await database
        .select()
        .from(entryRevisions)
        .where(
          and(
            eq(entryRevisions.entryId, id),
            eq(entryRevisions.revisionNumber, revisionNumber)
          )
        )
        .limit(1);
      return result[0];
    },

    async restoreRevision(
      id: string,
      revisionNumber: number,
      expectedVersion: number,
      now = new Date()
    ) {
      return database.transaction(async (transaction) => {
        const currentRows = await transaction
          .select({ entry: entries, performance: entryMusicDetails })
          .from(entries)
          .leftJoin(entryMusicDetails, eq(entryMusicDetails.entryId, entries.id))
          .where(eq(entries.id, id))
          .limit(1);
        const current = currentRows[0];
        if (!current) throw new EntryNotFoundError("Entry not found");
        if (current.entry.version !== expectedVersion) {
          throw new EntryConflictError("Entry version is stale");
        }
        const revisionRows = await transaction
          .select()
          .from(entryRevisions)
          .where(
            and(
              eq(entryRevisions.entryId, id),
              eq(entryRevisions.revisionNumber, revisionNumber)
            )
          )
          .limit(1);
        const revision = revisionRows[0];
        if (!revision) throw new RevisionNotFoundError("Revision not found");
        assertSafeMarkdown(revision.bodyMarkdown, "Revision");
        const restoredPerformance =
          revision.kind === "performance"
            ? performanceFromSnapshot(revision.performanceDetails)
            : null;
        if (revision.kind === "performance" && !restoredPerformance) {
          throw new EntryStateError("Performance revision has no performance details");
        }

        const nextVersion = expectedVersion + 1;
        const updated = await transaction
          .update(entries)
          .set({
            slug: revision.slug,
            kind: revision.kind,
            section: revision.section,
            tags: revision.tags,
            title: revision.title,
            summary: revision.summary,
            bodyMarkdown: revision.bodyMarkdown,
            version: nextVersion,
            updatedAt: now,
          })
          .where(and(eq(entries.id, id), eq(entries.version, expectedVersion)))
          .returning();
        if (!updated[0]) throw new EntryConflictError("Entry version is stale");

        await transaction
          .delete(entryMusicDetails)
          .where(eq(entryMusicDetails.entryId, id));
        if (restoredPerformance) {
          await transaction.insert(entryMusicDetails).values({
            entryId: id,
            ...performanceValues(restoredPerformance),
            createdAt: now,
            updatedAt: now,
          });
        }
        await transaction.insert(entryRevisions).values({
          entryId: id,
          revisionNumber: nextVersion,
          slug: revision.slug,
          kind: revision.kind,
          section: revision.section,
          tags: revision.tags,
          status: current.entry.status,
          title: revision.title,
          summary: revision.summary,
          bodyMarkdown: revision.bodyMarkdown,
          publishedAt: current.entry.publishedAt,
          performanceDetails: performanceSnapshot(restoredPerformance),
          createdAt: now,
        });
        return {
          ...updated[0],
          performance: restoredPerformance
            ? performanceValues(restoredPerformance)
            : null,
        };
      });
    },

    async createDraft(input: CreateDraftInput, now = new Date()) {
      return database.transaction(async (transaction) => {
        const id = randomUUID();
        const kind = input.kind ?? "note";
        const section = input.section ?? (kind === "performance" ? "music" : "writing");
        const tags = input.tags ?? [];
        const summary = input.summary ?? null;
        const bodyMarkdown = input.bodyMarkdown ?? "";
        const inserted = await transaction
          .insert(entries)
          .values({
            id,
            slug: input.slug,
            kind,
            section,
            tags,
            status: "draft",
            title: input.title,
            summary,
            bodyMarkdown,
            publishedAt: null,
            version: 1,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (kind === "performance" && input.performance) {
          await transaction.insert(entryMusicDetails).values({
            entryId: id,
            ...performanceValues(input.performance),
            createdAt: now,
            updatedAt: now,
          });
        }
        await transaction.insert(entryRevisions).values({
          entryId: id,
          revisionNumber: 1,
          slug: input.slug,
          kind,
          section,
          tags,
          status: "draft",
          title: input.title,
          summary,
          bodyMarkdown,
          publishedAt: null,
          performanceDetails: performanceSnapshot(input.performance),
          createdAt: now,
        });
        return {
          ...inserted[0]!,
          performance:
            kind === "performance" && input.performance
              ? performanceValues(input.performance)
              : null,
        };
      });
    },

    async updateEntry(
      id: string,
      expectedVersion: number,
      input: EntryMutationInput,
      now = new Date()
    ) {
      return database.transaction(async (transaction) => {
        const current = await transaction
          .select({ entry: entries, performance: entryMusicDetails })
          .from(entries)
          .leftJoin(entryMusicDetails, eq(entryMusicDetails.entryId, entries.id))
          .where(eq(entries.id, id))
          .limit(1);
        if (!current[0]) throw new EntryNotFoundError("Entry not found");
        if (current[0].entry.version !== expectedVersion) {
          throw new EntryConflictError("Entry version is stale");
        }
        if (input.status === "scheduled" || input.status === "published") {
          assertSafeMarkdown(input.bodyMarkdown, "Entry");
        }
        if (entryMutationIsNoOp(current[0].entry, current[0].performance, input)) {
          return {
            ...current[0].entry,
            performance: publicPerformance(current[0].performance),
          };
        }

        const nextVersion = expectedVersion + 1;
        const updated = await transaction
          .update(entries)
          .set({
            slug: input.slug,
            kind: input.kind,
            section: input.section,
            tags: input.tags,
            status: input.status,
            title: input.title,
            summary: input.summary ?? null,
            bodyMarkdown: input.bodyMarkdown,
            publishedAt: input.publishedAt ?? null,
            version: nextVersion,
            updatedAt: now,
          })
          .where(and(eq(entries.id, id), eq(entries.version, expectedVersion)))
          .returning();
        if (!updated[0]) throw new EntryConflictError("Entry version is stale");

        await transaction
          .delete(entryMusicDetails)
          .where(eq(entryMusicDetails.entryId, id));
        if (input.kind === "performance" && input.performance) {
          await transaction.insert(entryMusicDetails).values({
            entryId: id,
            ...performanceValues(input.performance),
            createdAt: now,
            updatedAt: now,
          });
        }
        await transaction.insert(entryRevisions).values({
          entryId: id,
          revisionNumber: nextVersion,
          slug: input.slug,
          kind: input.kind,
          section: input.section,
          tags: input.tags,
          status: input.status,
          title: input.title,
          summary: input.summary ?? null,
          bodyMarkdown: input.bodyMarkdown,
          publishedAt: input.publishedAt ?? null,
          performanceDetails: performanceSnapshot(input.performance),
          createdAt: now,
        });
        return {
          ...updated[0],
          performance:
            input.kind === "performance" && input.performance
              ? performanceValues(input.performance)
              : null,
        };
      });
    },

    async transitionEntry(
      id: string,
      expectedVersion: number,
      transition:
        | { action: "publish" }
        | { action: "schedule"; scheduledAt: Date }
        | { action: "unpublish" }
        | { action: "archive" },
      now = new Date()
    ) {
      const current = await this.getEntry(id);
      if (!current) throw new EntryNotFoundError("Entry not found");

      let status = current.status;
      let publishedAt = current.publishedAt;
      if (transition.action === "publish") {
        status = "published";
        publishedAt = now;
      } else if (transition.action === "schedule") {
        if (transition.scheduledAt.getTime() <= now.getTime()) {
          throw new EntryStateError("Scheduled publication time must be in the future");
        }
        status = "scheduled";
        publishedAt = transition.scheduledAt;
      } else if (transition.action === "unpublish") {
        status = "draft";
        publishedAt = null;
      } else {
        status = "archived";
      }

      return this.updateEntry(
        id,
        expectedVersion,
        {
          slug: current.slug,
          kind: current.kind,
          section: current.section,
          tags: current.tags,
          status,
          title: current.title,
          summary: current.summary,
          bodyMarkdown: current.bodyMarkdown,
          publishedAt,
          performance: current.performance,
        },
        now
      );
    },

    async duplicateEntry(id: string, now = new Date()) {
      const source = await this.getEntry(id);
      if (!source) throw new EntryNotFoundError("Entry not found");
      assertSafeMarkdown(source.bodyMarkdown, "Entry");

      const baseSlug = `${source.slug}-copy`;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const matchingSlugs = await database
          .select({ slug: entries.slug })
          .from(entries)
          .where(like(entries.slug, `${baseSlug}%`));
        const existing = new Set(matchingSlugs.map((entry) => entry.slug));
        let slug = baseSlug;
        let suffix = 2;
        while (existing.has(slug)) {
          slug = `${baseSlug}-${suffix}`;
          suffix += 1;
        }

        try {
          return await this.createDraft(
            {
              slug,
              title: `${source.title} copy`,
              kind: source.kind,
              section: source.section,
              tags: source.tags,
              summary: source.summary,
              bodyMarkdown: source.bodyMarkdown,
              performance: source.performance,
            },
            now
          );
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      throw new EntryConflictError("Could not allocate a duplicate slug");
    },

    async deleteEntry(id: string, expectedVersion: number) {
      return database.transaction(async (transaction) => {
        const current = await transaction
          .select({ status: entries.status, version: entries.version })
          .from(entries)
          .where(eq(entries.id, id))
          .limit(1);
        if (!current[0]) throw new EntryNotFoundError("Entry not found");
        if (current[0].version !== expectedVersion) {
          throw new EntryConflictError("Entry version is stale");
        }
        if (current[0].status !== "draft" && current[0].status !== "archived") {
          throw new EntryStateError("Only draft or archived entries can be deleted");
        }

        const deleted = await transaction
          .delete(entries)
          .where(and(eq(entries.id, id), eq(entries.version, expectedVersion)))
          .returning({ id: entries.id });
        if (!deleted[0]) throw new EntryConflictError("Entry version is stale");
        return true;
      });
    },
  };
}
