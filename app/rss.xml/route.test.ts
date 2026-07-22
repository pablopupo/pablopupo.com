import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PUBLIC_PROFILE } from "@/lib/public-profile";

const mocks = vi.hoisted(() => ({
  getPublicEntries: vi.fn(),
  getPublicProfile: vi.fn(),
}));

vi.mock("@/lib/public-content", () => ({
  getPublicEntries: mocks.getPublicEntries,
}));

vi.mock("@/lib/public-profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-profile")>()),
  getPublicProfile: mocks.getPublicProfile,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.getPublicEntries.mockReset();
  mocks.getPublicProfile.mockReset();
  mocks.getPublicProfile.mockResolvedValue(DEFAULT_PUBLIC_PROFILE);
  mocks.getPublicEntries.mockResolvedValue([
    {
      slug: "writing-note",
      section: "writing",
      tags: ["AI"],
      title: "Writing note",
      summary: "A technical note.",
      bodyMarkdown: "Body",
      publishedAt: "2026-07-20T12:00:00.000Z",
    },
    {
      slug: "music-note",
      section: "music",
      tags: ["piano"],
      title: "Music note",
      summary: "A piano note.",
      bodyMarkdown: "Body",
      publishedAt: "2026-07-21T12:00:00.000Z",
    },
  ]);
});

describe("RSS route", () => {
  it("refreshes scheduled visibility within 60 seconds", async () => {
    const route = await import("./route");

    expect(route.revalidate).toBe(60);
  });

  it("serves all public writing and music as UTF-8 RSS", async () => {
    const route = await import("./route");

    const response = await route.GET();
    const xml = await response.text();

    expect(response.headers.get("content-type")).toBe(
      "application/rss+xml; charset=utf-8"
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=60, must-revalidate"
    );
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain("/writing/writing-note");
    expect(xml).toContain("/music/music-note");
    expect(mocks.getPublicEntries).toHaveBeenCalledTimes(1);
    expect(mocks.getPublicProfile).toHaveBeenCalledTimes(1);
  });

  it("propagates configured content database failures", async () => {
    const databaseError = new Error("database unavailable");
    mocks.getPublicEntries.mockRejectedValue(databaseError);
    const route = await import("./route");

    await expect(route.GET()).rejects.toBe(databaseError);
  });
});
