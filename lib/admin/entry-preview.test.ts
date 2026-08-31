import { describe, expect, it, vi } from "vitest";
import {
  createAdminEntryPreviewLoader,
  entryPreviewModel,
} from "./entry-preview";

const entryId = "11111111-1111-4111-8111-111111111111";

function record(
  status: "draft" | "scheduled" | "published" | "archived" = "draft"
) {
  return {
    id: entryId,
    slug: "clinical-evaluation-notes",
    kind: "note" as const,
    section: "writing" as const,
    tags: ["evaluation", "healthcare"],
    status,
    title: "Clinical evaluation notes",
    summary: "What changed after testing the first workflow.",
    bodyMarkdown: Array(231).fill("word").join(" "),
    publishedAt:
      status === "published" ? new Date("2026-07-20T15:00:00.000Z") : null,
    updatedAt: new Date("2026-08-06T13:30:00.000Z"),
    performance: null,
  };
}

describe("admin entry preview model", () => {
  it("gives an unpublished draft the saved update date and public reading-time shape", () => {
    expect(entryPreviewModel(record())).toEqual({
      status: "draft",
      entry: {
        id: entryId,
        slug: "clinical-evaluation-notes",
        kind: "note",
        section: "writing",
        tags: ["evaluation", "healthcare"],
        title: "Clinical evaluation notes",
        summary: "What changed after testing the first workflow.",
        bodyMarkdown: Array(231).fill("word").join(" "),
        publishedAt: "2026-08-06T13:30:00.000Z",
        readMinutes: 2,
        performance: null,
      },
    });
  });

  it("uses the publication date and normalizes performance dates for a published performance", () => {
    const input = {
      ...record("published"),
      kind: "performance" as const,
      section: "music" as const,
      bodyMarkdown: "Performance reflection.",
      performance: {
        workTitle: "Ballade No. 1",
        composer: "Frédéric Chopin",
        venue: "University Auditorium",
        performedAt: new Date("2026-06-01T19:00:00.000Z"),
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
        notesMarkdown: "A study in long-form phrasing.",
      },
    };

    expect(entryPreviewModel(input)).toMatchObject({
      status: "published",
      entry: {
        publishedAt: "2026-07-20T15:00:00.000Z",
        performance: {
          workTitle: "Ballade No. 1",
          performedAt: "2026-06-01T19:00:00.000Z",
        },
      },
    });
  });
});

describe("admin entry preview loader", () => {
  it.each(["draft", "scheduled", "archived", "published"] as const)(
    "loads a saved %s record without applying the public publication filter",
    async (status) => {
      const getEntry = vi.fn().mockResolvedValue(record(status));
      const load = createAdminEntryPreviewLoader({ getEntry });

      await expect(load(entryId)).resolves.toMatchObject({
        status,
        entry: { id: entryId },
      });
      expect(getEntry).toHaveBeenCalledWith(entryId);
    }
  );

  it("returns no preview when the saved record does not exist", async () => {
    const load = createAdminEntryPreviewLoader({
      getEntry: vi.fn().mockResolvedValue(undefined),
    });

    await expect(load(entryId)).resolves.toBeUndefined();
  });
});
