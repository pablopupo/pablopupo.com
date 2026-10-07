import { describe, expect, it } from "vitest";
import type { PublicEntry } from "./public-content";
import { collectSeries, entrySeries, seriesNeighbors, seriesPath, setSeriesTags, visibleEntryTags } from "./series";

export function seriesEntry(slug: string, overrides: Partial<PublicEntry> = {}): PublicEntry {
  return { id: slug, slug, kind: "note", section: "music", title: slug, tags: ["piano", "series:Practice journal"], summary: null, bodyMarkdown: "", publishedAt: "2026-09-01T12:00:00Z", readMinutes: 1, performance: null, ...overrides };
}

describe("post series", () => {
  it("supports independent music and engineering series without prebuilt content", () => {
    expect(collectSeries([])).toEqual([]);
    const groups = collectSeries([seriesEntry("music"), seriesEntry("software", { section: "writing" })]);
    expect(groups).toHaveLength(2);
    expect(groups.map(seriesPath)).toEqual(["/music/series/practice-journal", "/writing/series/practice-journal"]);
    expect(entrySeries(seriesEntry("accent", { tags: ["series:Études & études", "part:2"] }))).toEqual({ title: "Études & études", slug: "etudes-etudes", part: 2 });
  });

  it("orders numbered posts deliberately and journal entries chronologically without mutating the archive", () => {
    const entries = [seriesEntry("later", { publishedAt: "2026-09-05" }), seriesEntry("second", { tags: ["series:Practice journal", "part:2"] }), seriesEntry("first", { tags: ["series:Practice journal", "part:1"] }), seriesEntry("earlier")];
    expect(collectSeries(entries)[0].entries.map((entry) => entry.slug)).toEqual(["first", "second", "earlier", "later"]);
    expect(entries[0].slug).toBe("later");
    expect(seriesNeighbors(entries, entries[1])).toMatchObject({ previous: { slug: "first" }, next: { slug: "earlier" } });
    expect(seriesNeighbors(entries, entries[2])).toMatchObject({ previous: null, next: { slug: "second" } });
    expect(seriesNeighbors(entries, seriesEntry("missing"))).toBeNull();
  });

  it("keeps series metadata out of visible tags and removes order when leaving a series", () => {
    const tags = setSeriesTags(["piano", "series:Old name", "part:2"], " Weekly recordings ", "3");
    expect(tags).toEqual(["piano", "series:Weekly recordings", "part:3"]);
    expect(visibleEntryTags(tags)).toEqual(["piano"]);
    expect(setSeriesTags(tags, "")).toEqual(["piano"]);
  });
});
