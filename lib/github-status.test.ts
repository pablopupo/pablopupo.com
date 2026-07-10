import { describe, it, expect } from "vitest";
import { reconcile, type PrState } from "./github-status";
import type { Contribution } from "./contributions";

const base: Contribution = {
  repo: "docling-project/docling",
  pr: 3753,
  url: "https://github.com/docling-project/docling/pull/3753",
  title: "orphaned table text recovery",
  date: "2026-07-04",
  status: "open",
};

describe("reconcile", () => {
  it("marks merged PRs merged", () => {
    const pr: PrState = { state: "closed", merged: true };
    expect(reconcile(base, pr).status).toBe("merged");
  });

  it("marks closed unmerged PRs closed", () => {
    const pr: PrState = { state: "closed", merged: false };
    expect(reconcile(base, pr).status).toBe("closed");
  });

  it("keeps open PRs open", () => {
    const pr: PrState = { state: "open", merged: false };
    expect(reconcile(base, pr).status).toBe("open");
  });

  it("falls back to the stored status when the fetch failed", () => {
    expect(reconcile(base, null).status).toBe("open");
  });
});
