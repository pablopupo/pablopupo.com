import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import * as schema from "../db/schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "../db/test-database";

const portraitId = "4c6dfd5f-90bf-45fd-b922-fdf2e01b45fb";
const resumeId = "8de31ccf-3422-497f-b1b1-9d3b61e5aa0a";
const now = new Date("2026-07-22T12:00:00.000Z");

let client: PGlite | undefined;

function database() {
  if (!client) throw new Error("Repository test database is unavailable");
  return drizzle(client, { schema });
}

async function repositories() {
  const module = await import("./profile-repository").catch(() => undefined);
  expect(module?.createAdminSettingsRepository).toBeTypeOf("function");
  expect(module?.createAdminMediaRepository).toBeTypeOf("function");
  return {
    settings: module!.createAdminSettingsRepository(database()),
    media: module!.createAdminMediaRepository(database()),
  };
}

async function insertMedia(
  id: string,
  purpose: "profile" | "resume" | "content",
  mimeType: string
) {
  if (!client) throw new Error("Repository test database is unavailable");
  await client.query(
    `INSERT INTO media
       (id, storage_key, url, provider, purpose, original_filename, sha256,
        mime_type, alt_text, width, height, byte_size, created_at, updated_at)
     VALUES ($1, $2, $3, 'static', $4::media_purpose, $5, $6, $7, $8, $9, $10, 3, $11, $11)`,
    [
      id,
      `test/${id}`,
      `/test/${id}`,
      purpose,
      `test-${id}`,
      "a".repeat(64),
      mimeType,
      mimeType.startsWith("image/") ? "Test image" : null,
      mimeType.startsWith("image/") ? 10 : null,
      mimeType.startsWith("image/") ? 20 : null,
      now,
    ]
  );
}

async function insertSettings() {
  if (!client) throw new Error("Repository test database is unavailable");
  await client.query(
    `INSERT INTO site_settings
       (site_title, headline, intro_markdown, about_markdown, avatar_media_id,
        resume_media_id, version, created_at, updated_at)
     VALUES ('Pablo Pupo', 'Software Engineer, Applied AI', 'Intro', 'About', $1, $2, 1, $3, $3)`,
    [portraitId, resumeId, now]
  );
}

beforeAll(async () => {
  client = await createMigratedDatabase();
  expect(client, "generated SQL migrations").toBeDefined();
}, PGLITE_TEST_TIMEOUT_MS);

afterEach(async () => {
  await client?.exec("TRUNCATE TABLE site_settings, media CASCADE");
}, PGLITE_TEST_TIMEOUT_MS);

afterAll(async () => {
  await client?.close();
}, PGLITE_TEST_TIMEOUT_MS);

describe.sequential("profile migration seed", () => {
  it("seeds the approved static portrait, resume, and public settings exactly", async () => {
    if (!client) throw new Error("Repository test database is unavailable");
    const media = await client.query<{
      id: string;
      storage_key: string;
      url: string;
      provider: string;
      purpose: string;
      original_filename: string;
      sha256: string;
      mime_type: string;
      alt_text: string | null;
      width: number | null;
      height: number | null;
      byte_size: number;
    }>(
      `SELECT id, storage_key, url, provider, purpose, original_filename,
              sha256, mime_type, alt_text, width, height, byte_size::int
       FROM media
       ORDER BY purpose`
    );

    expect(media.rows).toEqual([
      {
        id: portraitId,
        storage_key: "media/pablo-pupo-portrait.jpg",
        url: "/media/pablo-pupo-portrait.jpg",
        provider: "static",
        purpose: "profile",
        original_filename: "pablo-pupo-portrait.jpg",
        sha256: "a26ce2ad31296fb149e124517a0faecf31d2c3ed1a24ef44b59171ce3e0b57ea",
        mime_type: "image/jpeg",
        alt_text: "Pablo Pupo smiling outside at the University of Florida",
        width: 2848,
        height: 4272,
        byte_size: 578420,
      },
      {
        id: resumeId,
        storage_key: "Pablo-Pupo-Resume.pdf",
        url: "/Pablo-Pupo-Resume.pdf",
        provider: "static",
        purpose: "resume",
        original_filename: "Pablo-Pupo-Resume.pdf",
        sha256: "9a1f7a93b1fe4a1b9879ad3fca8f589961d4f6085e895be11cc02b21a1b99096",
        mime_type: "application/pdf",
        alt_text: null,
        width: null,
        height: null,
        byte_size: 119473,
      },
    ]);

    const settings = await client.query<Record<string, unknown>>(
      `SELECT site_title, headline, location, graduation_on::text,
              intro_markdown, about_markdown, contact_email, github_url,
              linkedin_url, youtube_url, avatar_media_id, resume_media_id, version
       FROM site_settings`
    );
    expect(settings.rows).toEqual([
      {
        site_title: "Pablo Pupo",
        headline: "AI Engineer at Handtevy",
        location: "Miami, Florida",
        graduation_on: "2026-12-01",
        intro_markdown:
          "CS student at UF. AI engineer at Handtevy. Classical pianist and music enthusiast.",
        about_markdown:
          "I study computer science at the University of Florida and build applied AI systems, with a focus on document intelligence, retrieval, and evaluation. I write technical notes about what I learn. I’m also a classical pianist, and I share performances and writing about music here.",
        contact_email: "pablofpupo23@gmail.com",
        github_url: "https://github.com/pablopupo",
        linkedin_url: "https://linkedin.com/in/pablopupo",
        youtube_url: null,
        avatar_media_id: portraitId,
        resume_media_id: resumeId,
        version: 3,
      },
    ]);
    expect(JSON.stringify(settings.rows)).not.toContain("200,000");
  });
});

describe.sequential("admin settings repository", () => {
  it("loads media references and updates a partial patch at the expected version", async () => {
    await insertMedia(portraitId, "profile", "image/jpeg");
    await insertMedia(resumeId, "resume", "application/pdf");
    await insertSettings();
    const repository = (await repositories()).settings;

    await expect(repository.getSettings()).resolves.toMatchObject({
      siteTitle: "Pablo Pupo",
      headline: "Software Engineer, Applied AI",
      version: 1,
      avatarMedia: { id: portraitId, mimeType: "image/jpeg" },
      resumeMedia: { id: resumeId, mimeType: "application/pdf" },
    });

    const updated = await repository.updateSettings(1, {
      location: "Miami, Florida",
      graduationOn: "2026-12-01",
      githubUrl: "https://github.com/pablopupo",
    }, new Date("2026-07-22T13:00:00.000Z"));

    expect(updated).toMatchObject({
      siteTitle: "Pablo Pupo",
      location: "Miami, Florida",
      graduationOn: "2026-12-01",
      githubUrl: "https://github.com/pablopupo",
      version: 2,
      updatedAt: new Date("2026-07-22T13:00:00.000Z"),
    });
  });

  it("rejects stale updates without changing settings", async () => {
    await insertMedia(portraitId, "profile", "image/jpeg");
    await insertMedia(resumeId, "resume", "application/pdf");
    await insertSettings();
    const repository = (await repositories()).settings;

    await expect(
      repository.updateSettings(2, { headline: "Stale overwrite" }, now)
    ).rejects.toMatchObject({ name: "SettingsConflictError" });
    await expect(repository.getSettings()).resolves.toMatchObject({
      headline: "Software Engineer, Applied AI",
      version: 1,
    });
  });

  it("requires avatar media to be an image and resume media to be a PDF", async () => {
    await insertMedia(portraitId, "profile", "image/jpeg");
    await insertMedia(resumeId, "resume", "application/pdf");
    await insertSettings();
    const repository = (await repositories()).settings;

    await expect(
      repository.updateSettings(1, { avatarMediaId: resumeId }, now)
    ).rejects.toMatchObject({
      name: "SettingsMediaTypeError",
      message: "avatar media must be an image",
    });
    await expect(
      repository.updateSettings(1, { resumeMediaId: portraitId }, now)
    ).rejects.toMatchObject({
      name: "SettingsMediaTypeError",
      message: "resume media must be a PDF",
    });
    await expect(repository.getSettings()).resolves.toMatchObject({ version: 1 });
  });

  it("rejects references to missing media", async () => {
    await insertMedia(portraitId, "profile", "image/jpeg");
    await insertMedia(resumeId, "resume", "application/pdf");
    await insertSettings();
    const repository = (await repositories()).settings;

    await expect(
      repository.updateSettings(
        1,
        { avatarMediaId: "99999999-9999-4999-8999-999999999999" },
        now
      )
    ).rejects.toMatchObject({ name: "SettingsMediaTypeError" });
  });
});

describe.sequential("admin media repository", () => {
  it("stores verified metadata and lists newest uploads first", async () => {
    const repository = (await repositories()).media;
    const first = await repository.createMedia(
      {
        storageKey: "uploads/first.jpg",
        url: "https://blob.example/first.jpg",
        provider: "vercel-blob",
        purpose: "content",
        originalFilename: "first.JPG",
        sha256: "1".repeat(64),
        mimeType: "image/jpeg",
        altText: "First image",
        width: 100,
        height: 200,
        byteSize: 123,
      },
      now
    );
    const second = await repository.createMedia(
      {
        storageKey: "uploads/second.pdf",
        url: "https://blob.example/second.pdf",
        provider: "vercel-blob",
        purpose: "resume",
        originalFilename: "resume.pdf",
        sha256: "2".repeat(64),
        mimeType: "application/pdf",
        altText: null,
        width: null,
        height: null,
        byteSize: 456,
      },
      new Date("2026-07-22T13:00:00.000Z")
    );

    expect(first).toMatchObject({
      provider: "vercel-blob",
      purpose: "content",
      originalFilename: "first.JPG",
      sha256: "1".repeat(64),
      byteSize: 123,
    });
    expect(second).toMatchObject({ purpose: "resume", mimeType: "application/pdf" });
    await expect(repository.listMedia()).resolves.toMatchObject([
      { id: second.id, storageKey: "uploads/second.pdf" },
      { id: first.id, storageKey: "uploads/first.jpg" },
    ]);
  });
});
