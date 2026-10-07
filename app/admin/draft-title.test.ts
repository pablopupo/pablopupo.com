import { describe, expect, it } from "vitest";
import { availableDraftSlug, titleToSlug } from "./draft-title";

describe("draft URL suggestions", () => {
  it("normalizes punctuation and accents", () => {
    expect(titleToSlug("  Études: What I’m learning! ")).toBe("etudes-what-i-m-learning");
  });
  it("avoids existing URLs without changing those entries", () => {
    expect(availableDraftSlug("Weekly note", ["weekly-note", "weekly-note-2"])).toBe("weekly-note-3");
  });
  it("leaves room for a collision suffix within the server limit", () => {
    const title = "a".repeat(250);
    const base = titleToSlug(title);
    expect(availableDraftSlug(title, [base]).length).toBeLessThanOrEqual(120);
  });
});
