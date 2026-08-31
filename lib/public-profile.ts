import { eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getDatabase } from "./db/client";
import { media, siteSettings } from "./db/schema";
import type * as schema from "./db/schema";

export type PublicProfile = {
  siteTitle: string;
  headline: string;
  location: string | null;
  graduationOn: string | null;
  introMarkdown: string;
  aboutMarkdown: string;
  contactEmail: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  youtubeUrl: string | null;
  portraitUrl: string;
  portraitAlt: string;
  resumeUrl: string;
};

type ProfileMediaRecord = {
  url: string;
  altText: string | null;
  mimeType: string;
};

export type PublicProfileSettingsRecord = {
  siteTitle: string;
  headline: string;
  location: string | null;
  graduationOn: string | null;
  introMarkdown: string;
  aboutMarkdown: string;
  contactEmail: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  youtubeUrl: string | null;
  avatarMedia: ProfileMediaRecord | null;
  resumeMedia: ProfileMediaRecord | null;
};

type PublicProfileReaderDependencies = {
  databaseUrl: () => string | undefined;
  readSettings: () => Promise<PublicProfileSettingsRecord | undefined>;
};

export const DEFAULT_PUBLIC_PROFILE: Readonly<PublicProfile> = Object.freeze({
  siteTitle: "Pablo Pupo",
  headline: "AI Engineer at Handtevy",
  location: "Miami, Florida",
  graduationOn: "2026-12-01",
  introMarkdown:
    "CS student at UF. AI engineer at Handtevy. Classical pianist and music enthusiast.",
  aboutMarkdown:
    "I study computer science at the University of Florida and build applied AI systems, with a focus on document intelligence, retrieval, and evaluation. I write technical notes about what I learn. I’m also a classical pianist, and I share performances and writing about music here.",
  contactEmail: "pablofpupo23@gmail.com",
  githubUrl: "https://github.com/pablopupo",
  linkedinUrl: "https://linkedin.com/in/pablopupo",
  youtubeUrl: null,
  portraitUrl: "/media/pablo-pupo-portrait.jpg",
  portraitAlt: "Pablo Pupo smiling outside at the University of Florida",
  resumeUrl: "/Pablo-Pupo-Resume.pdf",
});

function requiredText(value: string, fallback: string) {
  return value.trim() || fallback;
}

function resolveProfile(record: PublicProfileSettingsRecord): PublicProfile {
  const portrait =
    record.avatarMedia?.mimeType.startsWith("image/") &&
    record.avatarMedia.url.trim()
      ? record.avatarMedia
      : null;
  const resume =
    record.resumeMedia?.mimeType === "application/pdf" &&
    record.resumeMedia.url.trim()
      ? record.resumeMedia
      : null;

  return {
    siteTitle: requiredText(
      record.siteTitle,
      DEFAULT_PUBLIC_PROFILE.siteTitle
    ),
    headline: requiredText(
      record.headline,
      DEFAULT_PUBLIC_PROFILE.headline
    ),
    location: record.location,
    graduationOn: record.graduationOn,
    introMarkdown: record.introMarkdown,
    aboutMarkdown: record.aboutMarkdown,
    contactEmail: record.contactEmail,
    githubUrl: record.githubUrl,
    linkedinUrl: record.linkedinUrl,
    youtubeUrl: record.youtubeUrl,
    portraitUrl: portrait?.url.trim() ?? DEFAULT_PUBLIC_PROFILE.portraitUrl,
    portraitAlt:
      portrait?.altText?.trim() || DEFAULT_PUBLIC_PROFILE.portraitAlt,
    resumeUrl: resume?.url.trim() ?? DEFAULT_PUBLIC_PROFILE.resumeUrl,
  };
}

export function createPublicProfileReader(
  dependencies: PublicProfileReaderDependencies
) {
  return {
    async getProfile(): Promise<PublicProfile> {
      if (!dependencies.databaseUrl()?.trim()) {
        return { ...DEFAULT_PUBLIC_PROFILE };
      }

      const settings = await dependencies.readSettings();
      return settings
        ? resolveProfile(settings)
        : { ...DEFAULT_PUBLIC_PROFILE };
    },
  };
}

export function createPublicProfileRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return {
    async readSettings(): Promise<PublicProfileSettingsRecord | undefined> {
      const settingsRows = await database
        .select({
          siteTitle: siteSettings.siteTitle,
          headline: siteSettings.headline,
          location: siteSettings.location,
          graduationOn: siteSettings.graduationOn,
          introMarkdown: siteSettings.introMarkdown,
          aboutMarkdown: siteSettings.aboutMarkdown,
          contactEmail: siteSettings.contactEmail,
          githubUrl: siteSettings.githubUrl,
          linkedinUrl: siteSettings.linkedinUrl,
          youtubeUrl: siteSettings.youtubeUrl,
          avatarMediaId: siteSettings.avatarMediaId,
          resumeMediaId: siteSettings.resumeMediaId,
        })
        .from(siteSettings)
        .where(eq(siteSettings.singletonKey, "default"))
        .limit(1);
      const settings = settingsRows[0];
      if (!settings) return undefined;

      const mediaIds = [
        settings.avatarMediaId,
        settings.resumeMediaId,
      ].filter((id): id is string => id !== null);
      const mediaRows = mediaIds.length
        ? await database
            .select({
              id: media.id,
              url: media.url,
              altText: media.altText,
              mimeType: media.mimeType,
            })
            .from(media)
            .where(inArray(media.id, mediaIds))
        : [];
      const mediaById = new Map(mediaRows.map((item) => [item.id, item]));

      return {
        siteTitle: settings.siteTitle,
        headline: settings.headline,
        location: settings.location,
        graduationOn: settings.graduationOn,
        introMarkdown: settings.introMarkdown,
        aboutMarkdown: settings.aboutMarkdown,
        contactEmail: settings.contactEmail,
        githubUrl: settings.githubUrl,
        linkedinUrl: settings.linkedinUrl,
        youtubeUrl: settings.youtubeUrl,
        avatarMedia: settings.avatarMediaId
          ? mediaById.get(settings.avatarMediaId) ?? null
          : null,
        resumeMedia: settings.resumeMediaId
          ? mediaById.get(settings.resumeMediaId) ?? null
          : null,
      };
    },
  };
}

const publicProfileReader = createPublicProfileReader({
  databaseUrl: () => process.env.DATABASE_URL,
  readSettings: () =>
    createPublicProfileRepository(getDatabase()).readSettings(),
});

export function getPublicProfile() {
  return publicProfileReader.getProfile();
}
