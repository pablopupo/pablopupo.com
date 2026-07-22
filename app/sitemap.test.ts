import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "@/lib/site";

const mocks = vi.hoisted(() => ({
  getPublicEntries: vi.fn(),
  getPublicProjects: vi.fn(),
}));

vi.mock("@/lib/public-content", () => ({
  getPublicEntries: mocks.getPublicEntries,
  getPublicProjects: mocks.getPublicProjects,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.getPublicEntries.mockReset();
  mocks.getPublicProjects.mockReset();
  mocks.getPublicEntries.mockResolvedValue([
    {
      slug: "retrieval-notes",
      section: "writing",
      publishedAt: "2026-07-20T12:00:00.000Z",
    },
    {
      slug: "chopin-ballade",
      section: "music",
      publishedAt: "2026-07-21T12:00:00.000Z",
    },
  ]);
  mocks.getPublicProjects.mockResolvedValue([
    {
      slug: "gradus-ad-parnassum",
      publishedAt: "2026-07-19T12:00:00.000Z",
    },
    {
      slug: "newer-project",
      publishedAt: "2026-07-22T12:00:00.000Z",
    },
  ]);
});

describe("sitemap", () => {
  it("refreshes scheduled visibility within 60 seconds", async () => {
    const route = await import("./sitemap");

    expect(route.revalidate).toBe(60);
  });

  it("lists public sections, resume, and individual public entries", async () => {
    const { default: sitemap } = await import("./sitemap");

    const entries = await sitemap();

    expect(entries.map((entry) => entry.url)).toEqual([
      siteUrl,
      `${siteUrl}/work`,
      `${siteUrl}/writing`,
      `${siteUrl}/music`,
      `${siteUrl}/about`,
      `${siteUrl}/resume`,
      `${siteUrl}/writing/retrieval-notes`,
      `${siteUrl}/music/chopin-ballade`,
    ]);
    expect(entries).not.toContainEqual(
      expect.objectContaining({ url: `${siteUrl}/search` })
    );
    expect(entries).not.toContainEqual(
      expect.objectContaining({ url: `${siteUrl}/admin` })
    );
  });

  it("represents public projects through Work with the newest publication time", async () => {
    const { default: sitemap } = await import("./sitemap");

    const entries = await sitemap();
    const work = entries.find((entry) => entry.url === `${siteUrl}/work`);

    expect(work?.lastModified).toEqual(
      new Date("2026-07-22T12:00:00.000Z")
    );
    expect(entries.some((entry) => entry.url.includes("#"))).toBe(false);
    expect(mocks.getPublicEntries).toHaveBeenCalledTimes(1);
    expect(mocks.getPublicProjects).toHaveBeenCalledTimes(1);
  });

  it("propagates configured content database failures", async () => {
    const databaseError = new Error("database unavailable");
    mocks.getPublicProjects.mockRejectedValue(databaseError);
    const { default: sitemap } = await import("./sitemap");

    await expect(sitemap()).rejects.toBe(databaseError);
  });
});
