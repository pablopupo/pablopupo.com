import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { media, mediaPurpose, siteSettings } from "./schema";

describe("profile and media schema", () => {
  it("stores verified media provenance and purpose", () => {
    const columns = getTableConfig(media).columns.map((column) => column.name);

    expect(mediaPurpose.enumValues).toEqual(["profile", "resume", "content"]);
    expect(columns).toEqual(
      expect.arrayContaining([
        "provider",
        "purpose",
        "original_filename",
        "sha256",
        "mime_type",
        "alt_text",
        "width",
        "height",
        "byte_size",
      ])
    );
  });

  it("stores public profile fields with optimistic concurrency", () => {
    const config = getTableConfig(siteSettings);
    const columns = config.columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        "headline",
        "location",
        "graduation_on",
        "resume_media_id",
        "github_url",
        "linkedin_url",
        "youtube_url",
        "version",
      ])
    );
    expect(config.checks.map((constraint) => constraint.name)).toContain(
      "site_settings_version_positive_check"
    );
  });
});
