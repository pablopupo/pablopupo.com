import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "./admin-session";

const SECRET = "test-secret";

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken(SECRET, 60_000);
    expect(verifySessionToken(token, SECRET)).toBe(true);
  });

  it("rejects a tampered token", () => {
    const token = createSessionToken(SECRET, 60_000);
    expect(verifySessionToken(token + "x", SECRET)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const token = createSessionToken(SECRET, 60_000);
    expect(verifySessionToken(token, "other")).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = createSessionToken(SECRET, -1);
    expect(verifySessionToken(token, SECRET)).toBe(false);
  });

  it("rejects garbage", () => {
    expect(verifySessionToken("not-a-token", SECRET)).toBe(false);
  });
});
