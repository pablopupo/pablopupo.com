import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getDatabase } from "./client";
import { entries, projects } from "./schema";
import type * as schema from "./schema";

export function createContentRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>
) {
  return {
    async listPublishedEntries(now = new Date()) {
      return database
        .select()
        .from(entries)
        .where(and(eq(entries.status, "published"), lte(entries.publishedAt, now)))
        .orderBy(desc(entries.publishedAt), asc(entries.slug));
    },

    async getPublishedEntry(slug: string, now = new Date()) {
      const result = await database
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.slug, slug),
            eq(entries.status, "published"),
            lte(entries.publishedAt, now)
          )
        )
        .limit(1);
      return result[0];
    },

    async listPublishedProjects(now = new Date()) {
      return database
        .select()
        .from(projects)
        .where(and(eq(projects.status, "published"), lte(projects.publishedAt, now)))
        .orderBy(asc(projects.sortOrder), asc(projects.slug));
    },
  };
}

export function listPublishedEntries(now = new Date()) {
  return createContentRepository(getDatabase()).listPublishedEntries(now);
}

export function getPublishedEntry(slug: string, now = new Date()) {
  return createContentRepository(getDatabase()).getPublishedEntry(slug, now);
}

export function listPublishedProjects(now = new Date()) {
  return createContentRepository(getDatabase()).listPublishedProjects(now);
}
