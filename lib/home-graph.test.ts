import { describe, expect, it } from "vitest";
import type { PublicEntry } from "./public-content";
import type { PublicGraphData, PublicGraphNode } from "./public-graph";
import { buildHomeGraph } from "./home-graph";

const node = (id: string, href: string | null, type: PublicGraphNode["type"] = "project"): PublicGraphNode => ({ id, href, type, label: id, pinned: false, deg: 0, summary: null });
const entry = (slug: string): PublicEntry => ({ id: slug, slug, kind: "note", section: "music", tags: ["series:Practice journal"], title: slug, summary: null, bodyMarkdown: "", publishedAt: "2026-09-01", readMinutes: 1, performance: null });

describe("homepage graph", () => {
  it("uses the existing Music point and connects Accordo to both entry points without erasing real links", () => {
    const source: PublicGraphData = {
      nodes: [node("uuid:accordo", "/accordo"), node("uuid:gradus", "/work/gradus-ad-parnassum"), { ...node("uuid:music", null, "concept"), label: "Music" }],
      edges: [{ id: "music-gradus", s: "uuid:music", t: "uuid:gradus", kind: "tag" }],
    };
    const result = buildHomeGraph(source, []);
    const engineering = result.nodes.find((item) => item.hub === "engineering")!;
    const music = result.nodes.find((item) => item.hub === "music")!;
    expect(engineering).toMatchObject({ label: "Engineering", href: "/work" });
    expect(music).toMatchObject({ id: "uuid:music", label: "Music", href: "/music" });
    for (const hub of [engineering, music]) {
      expect(result.edges.some((edge) => [edge.s, edge.t].includes(hub.id) && [edge.s, edge.t].includes("uuid:accordo"))).toBe(true);
    }
    expect(result.edges).toContainEqual(source.edges[0]);
    expect(result.nodes.filter((item) => item.label === "Music")).toHaveLength(1);
    expect(source.nodes[2].hub).toBeUndefined();
    expect(buildHomeGraph(result, [])).toEqual(result);
  });

  it("distinguishes recordings from writing even when both live in Music", () => {
    const source: PublicGraphData = { nodes: [node("essay", "/music/essay", "music"), node("recording", "/music/recording", "music")], edges: [] };
    const entries: PublicEntry[] = [
      { ...entry("essay"), kind: "essay", tags: [] },
      { ...entry("recording"), kind: "performance", tags: [] },
    ];
    const result = buildHomeGraph(source, entries);
    expect(result.nodes.find((item) => item.id === "essay")?.type).toBe("writing");
    expect(result.nodes.find((item) => item.id === "recording")?.type).toBe("music");
    expect(source.nodes[0].type).toBe("music");
  });

  it("connects Payments to Accordo and Nova with database IDs and no duplicate edges", () => {
    const source: PublicGraphData = { nodes: [node("project:uuid-1", "/accordo"), node("project:uuid-2", "/work/nova"), { ...node("concept:uuid-3", null, "concept"), label: "Payments" }], edges: [{ id: "existing", s: "project:uuid-2", t: "concept:uuid-3", kind: "tag" }] };
    const result = buildHomeGraph(source, []);
    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(5);
    expect(result.nodes.find((item) => item.label === "Payments")).toMatchObject({ pinned: true, deg: 2 });
    expect(result.edges.some((edge) => edge.s === "concept:uuid-3" && edge.t === "project:uuid-1")).toBe(true);
    expect(source.nodes[2]).toMatchObject({ pinned: false, deg: 0 });
    expect(source.edges).toHaveLength(1);
  });

  it("collapses a series to one point, retaining its connections and hiding unapproved members", () => {
    const source: PublicGraphData = { nodes: [node("entry:1", "/music/one", "music"), node("entry:2", "/music/two", "music"), node("piano", null, "concept")], edges: [{ id: "1", s: "entry:1", t: "piano", kind: "tag" }, { id: "2", s: "entry:2", t: "piano", kind: "tag" }, { id: "3", s: "entry:1", t: "entry:2", kind: "semantic" }] };
    const result = buildHomeGraph(source, [entry("one"), entry("two"), entry("not-on-map")]);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.find((item) => item.id.startsWith("series:"))).toMatchObject({ href: "/music/series/practice-journal", label: "Practice journal", deg: 2 });
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]).toMatchObject({ s: "series:music:practice-journal", t: "piano" });
    expect(buildHomeGraph({ nodes: [], edges: [] }, [entry("hidden")])).toEqual({ nodes: [], edges: [] });
  });
});
