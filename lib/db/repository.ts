import { and, asc, desc, eq, inArray, lte, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getDatabase } from "./client";
import {
  entries,
  entryMusicDetails,
  projectLinks,
  projects,
  projectTechnologies,
} from "./schema";
import type * as schema from "./schema";

export function createContentRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>
) {
  return {
    async listPublishedEntries(now = new Date()) {
      return database
        .select()
        .from(entries)
        .where(
          and(
            or(
              eq(entries.status, "published"),
              eq(entries.status, "scheduled")
            ),
            lte(entries.publishedAt, now)
          )
        )
        .orderBy(desc(entries.publishedAt), asc(entries.slug));
    },

    async getPublishedEntry(slug: string, now = new Date()) {
      const result = await database
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.slug, slug),
            or(
              eq(entries.status, "published"),
              eq(entries.status, "scheduled")
            ),
            lte(entries.publishedAt, now)
          )
        )
        .limit(1);
      return result[0];
    },

    async listEntryPerformanceDetails(entryIds: string[]) {
      if (entryIds.length === 0) return [];
      return database
        .select()
        .from(entryMusicDetails)
        .where(inArray(entryMusicDetails.entryId, entryIds))
        .orderBy(asc(entryMusicDetails.entryId));
    },

    async listPublishedProjects(now = new Date()) {
      return database
        .select()
        .from(projects)
        .where(
          and(
            or(
              eq(projects.status, "published"),
              eq(projects.status, "scheduled")
            ),
            lte(projects.publishedAt, now)
          )
        )
        .orderBy(asc(projects.sortOrder), asc(projects.slug));
    },

    async listProjectTechnologies(projectIds: string[]) {
      if (projectIds.length === 0) return [];
      return database
        .select()
        .from(projectTechnologies)
        .where(inArray(projectTechnologies.projectId, projectIds))
        .orderBy(
          asc(projectTechnologies.projectId),
          asc(projectTechnologies.sortOrder),
          asc(projectTechnologies.name)
        );
    },

    async listProjectLinks(projectIds: string[]) {
      if (projectIds.length === 0) return [];
      return database
        .select()
        .from(projectLinks)
        .where(inArray(projectLinks.projectId, projectIds))
        .orderBy(
          asc(projectLinks.projectId),
          asc(projectLinks.sortOrder),
          asc(projectLinks.label),
          asc(projectLinks.url)
        );
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
