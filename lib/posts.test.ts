import { describe, it, expect } from "vitest";
import { readingTime } from "./posts";

describe("readingTime", () => {
  it("rounds up at 230 words per minute with a 1 minute floor", () => {
    expect(readingTime("word")).toBe(1);
    expect(readingTime(Array(231).fill("word").join(" "))).toBe(2);
    expect(readingTime(Array(460).fill("word").join(" "))).toBe(2);
  });
});
