import type { PublicEntry, PublicPerformance } from "../public-content";
import { getDatabase } from "../db/client";
import { readingTime } from "../posts";
import { createAdminEntryRepository } from "./repository";

type EntryStatus = "draft" | "scheduled" | "published" | "archived";
type DateValue = Date | string;

type EntryPreviewRecord = {
  id: string;
  slug: string;
  kind: PublicEntry["kind"];
  section: PublicEntry["section"];
  tags: string[];
  status: EntryStatus;
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  publishedAt: DateValue | null;
  updatedAt: DateValue;
  performance: {
    workTitle: string;
    composer: string;
    venue: string | null;
    performedAt: DateValue | null;
    youtubeUrl: string;
    notesMarkdown: string | null;
  } | null;
};

export type AdminEntryPreview = {
  status: EntryStatus;
  entry: PublicEntry;
};

function isoDate(value: DateValue) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Entry preview date is invalid");
  return date.toISOString();
}

function performancePreview(
  performance: EntryPreviewRecord["performance"]
): PublicPerformance | null {
  if (!performance) return null;
  return {
    workTitle: performance.workTitle,
    composer: performance.composer,
    venue: performance.venue,
    performedAt: performance.performedAt
      ? isoDate(performance.performedAt)
      : null,
    youtubeUrl: performance.youtubeUrl,
    notesMarkdown: performance.notesMarkdown,
  };
}

export function entryPreviewModel(record: EntryPreviewRecord): AdminEntryPreview {
  return {
    status: record.status,
    entry: {
      id: record.id,
      slug: record.slug,
      kind: record.kind,
      section: record.section,
      tags: record.tags,
      title: record.title,
      summary: record.summary,
      bodyMarkdown: record.bodyMarkdown,
      publishedAt: isoDate(record.publishedAt ?? record.updatedAt),
      readMinutes: readingTime(record.bodyMarkdown),
      performance: performancePreview(record.performance),
    },
  };
}

export function createAdminEntryPreviewLoader(dependencies: {
  getEntry: (id: string) => Promise<EntryPreviewRecord | undefined>;
}) {
  return async (id: string) => {
    const record = await dependencies.getEntry(id);
    return record ? entryPreviewModel(record) : undefined;
  };
}

export function loadAdminEntryPreview(id: string) {
  const repository = createAdminEntryRepository(getDatabase());
  return createAdminEntryPreviewLoader({
    getEntry: (entryId) => repository.getEntry(entryId),
  })(id);
}
