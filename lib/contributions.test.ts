import { describe, it, expect } from "vitest";
import { groupByStatus, shortRef, type Contribution } from "./contributions";

const c = (over: Partial<Contribution>): Contribution => ({
  repo: "docling-project/docling",
  pr: 1,
  url: "https://github.com/docling-project/docling/pull/1",
  title: "t",
  date: "2026-07-01",
  status: "open",
  ...over,
});

describe("groupByStatus", () => {
  it("groups into merged, open, closed keeping order", () => {
    const list = [
      c({ pr: 3, status: "merged" }),
      c({ pr: 2, status: "open" }),
      c({ pr: 1, status: "closed" }),
      c({ pr: 4, status: "merged" }),
    ];
    const g = groupByStatus(list);
    expect(g.merged.map((x) => x.pr)).toEqual([3, 4]);
    expect(g.open.map((x) => x.pr)).toEqual([2]);
    expect(g.closed.map((x) => x.pr)).toEqual([1]);
  });
});

describe("shortRef", () => {
  it("uses the repo name after the slash", () => {
    expect(shortRef(c({ repo: "vllm-project/vllm", pr: 48157 }))).toBe(
      "vllm #48157"
    );
    expect(
      shortRef(c({ repo: "modelcontextprotocol/typescript-sdk", pr: 2418 }))
    ).toBe("typescript-sdk #2418");
  });
});
