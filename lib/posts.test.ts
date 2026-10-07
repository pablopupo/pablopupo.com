import { describe, it, expect } from "vitest";
import { readingTime, readPostPerformance, getPosts } from "./posts";

describe("readingTime", () => {
  it("rounds up at 230 words per minute with a 1 minute floor", () => {
    expect(readingTime("word")).toBe(1);
    expect(readingTime(Array(231).fill("word").join(" "))).toBe(2);
    expect(readingTime(Array(460).fill("word").join(" "))).toBe(2);
  });
});

describe("local performance content", () => {
  it("retains interpretation notes and recording details from local posts", () => {
    expect(readPostPerformance({ kind: "performance", workTitle: "Sonata", composer: "Beethoven", youtubeUrl: "https://www.youtube.com/watch?v=x1hzJP3AuD0", venue: "Recital room", performedAt: "2026-09-01", notesMarkdown: "A note about the phrasing." })).toMatchObject({ venue: "Recital room", performedAt: "2026-09-01T00:00:00.000Z", notesMarkdown: "A note about the phrasing." });
  });

  it("loads the selected recordings and preserves private writing drafts", () => {
    const posts = getPosts();
    expect(posts.filter((post) => post.performance)).toHaveLength(3);
    expect(posts.some((post) => post.slug === "vllm-tool-calls-and-response-schemas")).toBe(false);
    expect(posts.find((post) => post.slug === "beethoven-sonata-op-10-no-2")?.performance).toMatchObject({
      composer: "Ludwig van Beethoven",
      youtubeUrl: "https://www.youtube.com/watch?v=x1hzJP3AuD0",
      performedAt: null,
    });
  });

  it("rejects incomplete or off-platform performance metadata", () => {
    expect(() => readPostPerformance({ kind: "performance" })).toThrow();
    expect(() => readPostPerformance({
      kind: "performance", workTitle: "Sonata", composer: "Beethoven",
      youtubeUrl: "https://example.com/video",
    })).toThrow();
  });
});
