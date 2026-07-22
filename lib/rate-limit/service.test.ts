import { describe, expect, it, vi } from "vitest";

const secret = "0123456789abcdef0123456789abcdef";

function request(address: string, sessionId: string) {
  return new Request("https://pablopupo.com/api/analytics", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": `${address}, 10.0.0.1`,
    },
    body: JSON.stringify({ sessionId }),
  });
}

describe("global request rate limiter", () => {
  it("uses the documented limits for comments and analytics", async () => {
    const module = await import("./service").catch(() => undefined);

    expect(module?.rateLimitPolicies).toEqual({
      comments: { limit: 5, windowMs: 10 * 60 * 1_000 },
      analytics: { limit: 120, windowMs: 60 * 1_000 },
    });
  });

  it("cannot be bypassed by rotating analytics session UUIDs", async () => {
    const module = await import("./service").catch(() => undefined);
    expect(module?.createRequestRateLimiter).toBeTypeOf("function");
    const counts = new Map<string, number>();
    const take = vi.fn(async (input: { clientKey: string; limit: number }) => {
      const count = (counts.get(input.clientKey) ?? 0) + 1;
      counts.set(input.clientKey, count);
      return { allowed: count <= input.limit, retryAfter: count <= input.limit ? 0 : 60 };
    });
    const limiter = module!.createRequestRateLimiter({ take }, secret);
    const firstRequest = request(
      "203.0.113.4",
      "11111111-1111-4111-8111-111111111111"
    );
    const rotatedRequest = request(
      "203.0.113.4",
      "22222222-2222-4222-8222-222222222222"
    );

    for (let index = 0; index < 120; index += 1) {
      await expect(
        limiter.take("analytics", firstRequest, new Date("2026-07-22T12:00:00Z"))
      ).resolves.toMatchObject({ allowed: true });
    }
    await expect(
      limiter.take("analytics", rotatedRequest, new Date("2026-07-22T12:00:01Z"))
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });

    const keys = take.mock.calls.map(([input]) => input.clientKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(take.mock.calls)).not.toMatch(
      /203\.0\.113\.4|11111111-1111|22222222-2222/
    );
  });

  it("uses only the platform forwarding header as the client address", async () => {
    const { createRequestRateLimiter } = await import("./service");
    const take = vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 });
    const limiter = createRequestRateLimiter({ take }, secret);
    const first = new Request("https://pablopupo.com/api/comments", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });
    const spoofed = new Request("https://pablopupo.com/api/comments", {
      headers: { "x-forwarded-for": "198.51.100.9" },
    });

    await limiter.take("comments", first, new Date("2026-07-22T12:00:00Z"));
    await limiter.take("comments", spoofed, new Date("2026-07-22T12:00:01Z"));

    expect(take.mock.calls[0]![0].clientKey).toBe(
      take.mock.calls[1]![0].clientKey
    );
  });

  it("separates comment and analytics HMAC keys for the same address", async () => {
    const { createRequestRateLimiter } = await import("./service");
    const take = vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 });
    const limiter = createRequestRateLimiter({ take }, secret);
    const sameClient = request(
      "203.0.113.4",
      "11111111-1111-4111-8111-111111111111"
    );
    const now = new Date("2026-07-22T12:00:00Z");

    await limiter.take("comments", sameClient, now);
    await limiter.take("analytics", sameClient, now);

    expect(take.mock.calls[0]![0].clientKey).not.toBe(
      take.mock.calls[1]![0].clientKey
    );
  });

  it("rejects absent and short HMAC secrets", async () => {
    const { readRateLimitSecret } = await import("./service");

    expect(readRateLimitSecret({})).toBeUndefined();
    expect(readRateLimitSecret({ BETTER_AUTH_SECRET: "short" })).toBeUndefined();
    expect(readRateLimitSecret({ BETTER_AUTH_SECRET: secret })).toBe(secret);
  });
});
