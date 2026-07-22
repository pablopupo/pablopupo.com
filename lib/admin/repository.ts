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
  summary?: string | null;
  bodyMarkdown?: string;
  performance?: PerformanceInput | null;
};

type EntryMutationInput = {
  slug: string;
  kind: "note" | "essay" | "performance";
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

    async createDraft(input: CreateDraftInput, now = new Date()) {
      return database.transaction(async (transaction) => {
        const id = randomUUID();
        const kind = input.kind ?? "note";
        const summary = input.summary ?? null;
        const bodyMarkdown = input.bodyMarkdown ?? "";
        const inserted = await transaction
          .insert(entries)
          .values({
            id,
            slug: input.slug,
            kind,
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
          .select({ version: entries.version })
          .from(entries)
          .where(eq(entries.id, id))
          .limit(1);
        if (!current[0]) throw new EntryNotFoundError("Entry not found");
        if (current[0].version !== expectedVersion) {
          throw new EntryConflictError("Entry version is stale");
        }

        const nextVersion = expectedVersion + 1;
        const updated = await transaction
          .update(entries)
          .set({
            slug: input.slug,
            kind: input.kind,
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
