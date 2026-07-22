import { describe, expect, it, vi } from "vitest";

const approvedProfile = {
  siteTitle: "Pablo Pupo",
  headline: "Software Engineer, Applied AI",
  location: "Miami, Florida",
  graduationOn: "2026-12-01",
  introMarkdown:
    "I’m a software engineer focused on applied AI, open source, and reliable systems. I’m also a classical pianist.",
  aboutMarkdown:
    "I study computer science at the University of Florida and build applied AI systems, with a focus on document intelligence, retrieval, and evaluation. I contribute to open source and write technical notes about what I learn. I’m also a classical pianist, and I share performances and writing about music here.",
  contactEmail: "pablofpupo23@gmail.com",
  githubUrl: "https://github.com/pablopupo",
  linkedinUrl: "https://linkedin.com/in/pablopupo",
  youtubeUrl: null,
  portraitUrl: "/media/pablo-pupo-portrait.jpg",
  portraitAlt: "Pablo Pupo smiling outside at the University of Florida",
  resumeUrl: "/Pablo-Pupo-Resume.pdf",
};

async function setup(
  databaseUrl: string | undefined,
  readSettings = vi.fn().mockResolvedValue(undefined)
) {
  const module = await import("./public-profile").catch(() => undefined);
  expect(module?.createPublicProfileReader).toBeTypeOf("function");
  const reader = module!.createPublicProfileReader({
    databaseUrl: () => databaseUrl,
    readSettings,
  });
  return { module: module!, reader, readSettings };
}

describe("public profile reader", () => {
  it("uses the approved profile without accessing the database on localhost", async () => {
    const { module, reader, readSettings } = await setup(undefined);

    await expect(reader.getProfile()).resolves.toEqual(approvedProfile);
    expect(module.DEFAULT_PUBLIC_PROFILE).toEqual(approvedProfile);
    expect(readSettings).not.toHaveBeenCalled();
  });

  it("treats an empty database URL as unconfigured", async () => {
    const { reader, readSettings } = await setup("   ");

    await expect(reader.getProfile()).resolves.toEqual(approvedProfile);
    expect(readSettings).not.toHaveBeenCalled();
  });

  it("uses the approved profile when the configured database has no settings row", async () => {
    const { reader, readSettings } = await setup("postgres://configured");

    await expect(reader.getProfile()).resolves.toEqual(approvedProfile);
    expect(readSettings).toHaveBeenCalledTimes(1);
  });

  it("uses database values and selected media", async () => {
    const readSettings = vi.fn().mockResolvedValue({
      siteTitle: "Pablo's Notes",
      headline: "Applied AI Engineer",
      location: "Gainesville, Florida",
      graduationOn: "2026-12-19",
      introMarkdown: "A new introduction.",
      aboutMarkdown: "A new biography.",
      contactEmail: "hello@example.com",
      githubUrl: "https://github.com/example",
      linkedinUrl: "https://linkedin.com/in/example",
      youtubeUrl: "https://youtube.com/@example",
      avatarMedia: {
        url: "https://assets.example.com/portrait.webp",
        altText: "Pablo at a piano",
        mimeType: "image/webp",
      },
      resumeMedia: {
        url: "https://assets.example.com/resume.pdf",
        altText: null,
        mimeType: "application/pdf",
      },
    });
    const { reader } = await setup("postgres://configured", readSettings);

    await expect(reader.getProfile()).resolves.toEqual({
      siteTitle: "Pablo's Notes",
      headline: "Applied AI Engineer",
      location: "Gainesville, Florida",
      graduationOn: "2026-12-19",
      introMarkdown: "A new introduction.",
      aboutMarkdown: "A new biography.",
      contactEmail: "hello@example.com",
      githubUrl: "https://github.com/example",
      linkedinUrl: "https://linkedin.com/in/example",
      youtubeUrl: "https://youtube.com/@example",
      portraitUrl: "https://assets.example.com/portrait.webp",
      portraitAlt: "Pablo at a piano",
      resumeUrl: "https://assets.example.com/resume.pdf",
    });
  });

  it("preserves cleared optional fields and intentional empty body copy", async () => {
    const readSettings = vi.fn().mockResolvedValue({
      siteTitle: "   ",
      headline: "",
      location: null,
      graduationOn: null,
      introMarkdown: "",
      aboutMarkdown: "",
      contactEmail: null,
      githubUrl: null,
      linkedinUrl: null,
      youtubeUrl: null,
      avatarMedia: null,
      resumeMedia: null,
    });
    const { reader } = await setup("postgres://configured", readSettings);

    await expect(reader.getProfile()).resolves.toEqual({
      ...approvedProfile,
      location: null,
      graduationOn: null,
      introMarkdown: "",
      aboutMarkdown: "",
      contactEmail: null,
      githubUrl: null,
      linkedinUrl: null,
    });
  });

  it("falls back when selected media is missing, blank, or the wrong type", async () => {
    const readSettings = vi.fn().mockResolvedValue({
      ...approvedProfile,
      avatarMedia: {
        url: " ",
        altText: "",
        mimeType: "image/jpeg",
      },
      resumeMedia: {
        url: "https://assets.example.com/not-a-resume.jpg",
        altText: null,
        mimeType: "image/jpeg",
      },
    });
    const { reader } = await setup("postgres://configured", readSettings);

    await expect(reader.getProfile()).resolves.toMatchObject({
      portraitUrl: approvedProfile.portraitUrl,
      portraitAlt: approvedProfile.portraitAlt,
      resumeUrl: approvedProfile.resumeUrl,
    });
  });

  it("propagates configured database errors", async () => {
    const databaseError = new Error("database unavailable");
    const readSettings = vi.fn().mockRejectedValue(databaseError);
    const { reader } = await setup("postgres://configured", readSettings);

    await expect(reader.getProfile()).rejects.toBe(databaseError);
  });
});
