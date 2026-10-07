import { describe, expect, it } from "vitest";
import { performanceDateInput, performanceDateValue } from "./performance-date";

describe("performance date editing", () => {
  it("round-trips a performance day without timezone shifts", () => {
    const stored = "2023-11-30T00:00:00.000Z";
    expect(performanceDateInput(stored)).toBe("2023-11-30");
    expect(performanceDateValue(performanceDateInput(stored))).toBe(stored);
  });
  it("allows clearing an unknown date and rejects impossible dates", () => {
    expect(performanceDateInput(null)).toBe("");
    expect(performanceDateValue("")).toBeNull();
    expect(performanceDateValue("2023-02-30")).toBeNull();
    expect(performanceDateValue("November")).toBeNull();
  });
});
