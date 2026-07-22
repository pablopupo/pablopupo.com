import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { media, siteSettings } from "../db/schema";
import type * as schema from "../db/schema";

export type SettingsPatch = {
  siteTitle?: string;
  headline?: string;
  location?: string | null;
  graduationOn?: string | null;
  introMarkdown?: string;
  aboutMarkdown?: string;
  contactEmail?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  youtubeUrl?: string | null;
  avatarMediaId?: string | null;
  resumeMediaId?: string | null;
};

export type CreateMediaInput = {
  storageKey: string;
  url: string;
  provider: string;
  purpose: "profile" | "resume" | "content";
  originalFilename: string;
  sha256: string;
  mimeType: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  byteSize: number;
};

export class SettingsConflictError extends Error {
  name = "SettingsConflictError";
}

export class SettingsMediaTypeError extends Error {
  name = "SettingsMediaTypeError";
}

export class SettingsNotFoundError extends Error {
  name = "SettingsNotFoundError";
}

function publicMedia(row: typeof media.$inferSelect) {
  return {
    id: row.id,
    storageKey: row.storageKey,
    url: row.url,
    provider: row.provider,
    purpose: row.purpose,
    originalFilename: row.originalFilename,
    sha256: row.sha256,
    mimeType: row.mimeType,
    altText: row.altText,
    width: row.width,
    height: row.height,
    byteSize: row.byteSize,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function publicSettings(
  row: typeof siteSettings.$inferSelect,
  mediaRows: Array<typeof media.$inferSelect>
) {
  const byId = new Map(mediaRows.map((item) => [item.id, publicMedia(item)]));
  return {
    id: row.id,
    siteTitle: row.siteTitle,
    headline: row.headline,
    location: row.location,
    graduationOn: row.graduationOn,
    introMarkdown: row.introMarkdown,
    aboutMarkdown: row.aboutMarkdown,
    contactEmail: row.contactEmail,
    githubUrl: row.githubUrl,
    linkedinUrl: row.linkedinUrl,
    youtubeUrl: row.youtubeUrl,
    avatarMediaId: row.avatarMediaId,
    resumeMediaId: row.resumeMediaId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    avatarMedia: row.avatarMediaId ? byId.get(row.avatarMediaId) ?? null : null,
    resumeMedia: row.resumeMediaId ? byId.get(row.resumeMediaId) ?? null : null,
  };
}

function referencedMediaIds(row: typeof siteSettings.$inferSelect) {
  return [row.avatarMediaId, row.resumeMediaId].filter(
    (id): id is string => id !== null
  );
}

export function createAdminSettingsRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return {
    async getSettings() {
      const rows = await database
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.singletonKey, "default"))
        .limit(1);
      const row = rows[0];
      if (!row) return undefined;
      const ids = referencedMediaIds(row);
      const mediaRows = ids.length
        ? await database.select().from(media).where(inArray(media.id, ids))
        : [];
      return publicSettings(row, mediaRows);
    },

    async updateSettings(
      expectedVersion: number,
      patch: SettingsPatch,
      now = new Date()
    ) {
      return database.transaction(async (transaction) => {
        const currentRows = await transaction
          .select()
          .from(siteSettings)
          .where(eq(siteSettings.singletonKey, "default"))
          .limit(1);
        const current = currentRows[0];
        if (!current) throw new SettingsNotFoundError("settings not found");
        if (current.version !== expectedVersion) {
          throw new SettingsConflictError(
            "settings changed in another session"
          );
        }

        if (patch.avatarMediaId) {
          const rows = await transaction
            .select({ mimeType: media.mimeType })
            .from(media)
            .where(eq(media.id, patch.avatarMediaId))
            .limit(1);
          if (!rows[0]?.mimeType.startsWith("image/")) {
            throw new SettingsMediaTypeError(
              "avatar media must be an image"
            );
          }
        }
        if (patch.resumeMediaId) {
          const rows = await transaction
            .select({ mimeType: media.mimeType })
            .from(media)
            .where(eq(media.id, patch.resumeMediaId))
            .limit(1);
          if (rows[0]?.mimeType !== "application/pdf") {
            throw new SettingsMediaTypeError("resume media must be a PDF");
          }
        }

        const updatedRows = await transaction
          .update(siteSettings)
          .set({
            ...patch,
            version: expectedVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(siteSettings.id, current.id),
              eq(siteSettings.version, expectedVersion)
            )
          )
          .returning();
        const updated = updatedRows[0];
        if (!updated) {
          throw new SettingsConflictError(
            "settings changed in another session"
          );
        }
        const ids = referencedMediaIds(updated);
        const mediaRows = ids.length
          ? await transaction.select().from(media).where(inArray(media.id, ids))
          : [];
        return publicSettings(updated, mediaRows);
      });
    },
  };
}

export function createAdminMediaRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return {
    async listMedia() {
      const rows = await database
        .select()
        .from(media)
        .orderBy(desc(media.createdAt), asc(media.storageKey));
      return rows.map(publicMedia);
    },

    async createMedia(input: CreateMediaInput, now = new Date()) {
      const rows = await database
        .insert(media)
        .values({
          ...input,
          metadata: {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const created = rows[0];
      if (!created) throw new Error("media insert returned no record");
      return publicMedia(created);
    },
  };
}
