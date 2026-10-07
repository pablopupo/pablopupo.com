import { describe, expect, it } from "vitest";
import { navigationMotion } from "./navigation-motion";

describe("public navigation motion", () => {
  it.each([
    ["/work", "home-engineering"],
    ["/music", "home-music"],
    ["/accordo", "home-accordo"],
  ])("glides out from Home and slides back from %s", (path, identity) => {
    expect(navigationMotion("/", path)).toEqual(["from-home", identity]);
    expect(navigationMotion(path, "/")).toEqual(["to-home", "section-back"]);
  });

  it("follows section order and returns home from detail pages without inventing a shared title", () => {
    expect(navigationMotion("/work", "/music")).toEqual(["section-forward"]);
    expect(navigationMotion("/about", "/music")).toEqual(["section-back"]);
    expect(navigationMotion("/writing/essay", "/")).toEqual(["to-home", "section-back"]);
    expect(navigationMotion("/work/project", "/work")).toEqual(["detail-back"]);
  });

  it("ignores same-page anchors, external links, and admin navigation", () => {
    expect(navigationMotion("/music", "/music#recordings")).toBeUndefined();
    expect(navigationMotion("/", "https://example.com")).toBeUndefined();
    expect(navigationMotion("/", "//example.com")).toBeUndefined();
    expect(navigationMotion("/admin", "/music")).toBeUndefined();
    expect(navigationMotion("/", "/admin")).toBeUndefined();
    expect(navigationMotion(null, "/music")).toBeUndefined();
    expect(navigationMotion("/", "/music?source=home#recordings")).toEqual(["from-home", "home-music"]);
  });

  it.each([
    ["/", "section-forward"],
    ["/work", "section-forward"],
    ["/work/kit-ai", "section-forward"],
    ["/music", "section-forward"],
    ["/music/schumann-abegg-variations", "section-forward"],
    ["/music/series/recital", "section-forward"],
    ["/accordo", "section-forward"],
    ["/about", "section-back"],
  ])("uses the section transition from %s into Writing", (from, direction) => {
    expect(navigationMotion(from, "/writing")).toEqual([direction]);
  });

  it("keeps cross-section navigation consistent after reading a post", () => {
    expect(navigationMotion("/writing/essay", "/music")).toEqual(["section-back"]);
    expect(navigationMotion("/music/performance", "/work")).toEqual(["section-back"]);
    expect(navigationMotion("/writing/essay", "/writing")).toEqual(["detail-back"]);
    expect(navigationMotion("/music/performance", "/music")).toEqual(["detail-back"]);
    expect(navigationMotion("/writing", "/writing/essay")).toBeUndefined();
    expect(navigationMotion("/search", "/writing")).toEqual(["section-forward"]);
  });

  const sections = ["/", "/work", "/music", "/accordo", "/writing", "/about"];
  it.each(sections.flatMap((from, origin) => sections.map((to, destination) => ({ from, to, origin, destination }))))(
    "keeps $from → $to consistent with the navigation order",
    ({ from, to, origin, destination }) => {
      const types = navigationMotion(from, to);
      if (from === to) expect(types).toBeUndefined();
      else if (from === "/" && ["/work", "/music", "/accordo"].includes(to)) expect(types).toContain("from-home");
      else expect(types).toContain(destination > origin ? "section-forward" : "section-back");
      expect(types ?? []).not.toContain("home-return");
    }
  );
});
