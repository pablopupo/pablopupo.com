import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "../db/test-database";

let client: PGlite | undefined;

async function repository() {
  if (!client) throw new Error("Rate-limit test database is unavailable");
  const module = await import("./repository").catch(() => undefined);
  expect(module?.createRateLimitRepository).toBeTypeOf("function");
  return module!.createRateLimitRepository(drizzle(client, { schema }));
}

beforeAll(async () => {
  client = await createMigratedDatabase();
  expect(client, "generated SQL migrations").toBeDefined();
}, PGLITE_TEST_TIMEOUT_MS);

afterEach(async () => {
  await client?.exec("TRUNCATE TABLE rate_limit_buckets");
}, PGLITE_TEST_TIMEOUT_MS);

afterAll(async () => {
  await client?.close();
}, PGLITE_TEST_TIMEOUT_MS);

describe.sequential("rate-limit repository", () => {
  it("persists only the scoped HMAC key produced from a forwarded address", async () => {
    const limits = await repository();
    const { createRequestRateLimiter } = await import("./service");
    const limiter = createRequestRateLimiter(
      limits,
      "0123456789abcdef0123456789abcdef"
    );
    const request = new Request("https://pablopupo.com/api/analytics", {
      headers: { "x-vercel-forwarded-for": "203.0.113.4" },
    });

    await limiter.take(
      "analytics",
      request,
      new Date("2026-07-22T12:00:00.000Z")
    );

    const buckets = await client!.query<{ scope: string; client_key: string }>(
      `SELECT scope, client_key FROM rate_limit_buckets`
    );
    expect(buckets.rows).toEqual([
      { scope: "analytics", client_key: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
    expect(JSON.stringify(buckets.rows)).not.toContain("203.0.113.4");
  });

  it("atomically enforces a fixed window across concurrent requests", async () => {
    const limits = await repository();
    const now = new Date("2026-07-22T12:00:00.000Z");
    const input = {
      scope: "comments" as const,
      clientKey: "a".repeat(64),
      limit: 2,
      windowMs: 60_000,
      now,
    };

    const results = await Promise.all([
      limits.take(input),
      limits.take(input),
      limits.take(input),
    ]);

    expect(results.filter((result) => result.allowed)).toHaveLength(2);
    expect(results.filter((result) => !result.allowed)).toEqual([
      { allowed: false, retryAfter: 60 },
    ]);
    const buckets = await client!.query<Record<string, unknown>>(
      `SELECT scope, client_key, request_count, window_started_at, expires_at
       FROM rate_limit_buckets`
    );
    expect(buckets.rows).toHaveLength(1);
    expect(buckets.rows[0]).toMatchObject({
      scope: "comments",
      client_key: "a".repeat(64),
      request_count: 3,
      window_started_at: now,
      expires_at: new Date("2026-07-22T12:01:00.000Z"),
    });
  });

  it("resets expired clients and prunes other expired buckets", async () => {
    const limits = await repository();
    const old = new Date("2026-07-22T11:00:00.000Z");
    const current = new Date("2026-07-22T12:00:00.000Z");
    await limits.take({
      scope: "analytics",
      clientKey: "b".repeat(64),
      limit: 1,
      windowMs: 1_000,
      now: old,
    });
    await limits.take({
      scope: "comments",
      clientKey: "c".repeat(64),
      limit: 1,
      windowMs: 1_000,
      now: old,
    });

    await expect(
      limits.take({
        scope: "analytics",
        clientKey: "b".repeat(64),
        limit: 1,
        windowMs: 1_000,
        now: current,
      })
    ).resolves.toEqual({ allowed: true, retryAfter: 0 });

    const buckets = await client!.query<{
      scope: string;
      client_key: string;
      request_count: number;
    }>(
      `SELECT scope, client_key, request_count
       FROM rate_limit_buckets
       ORDER BY scope, client_key`
    );
    expect(buckets.rows).toEqual([
      {
        scope: "analytics",
        client_key: "b".repeat(64),
        request_count: 1,
      },
    ]);
  });

  it("keeps comment and analytics windows independent for the same client", async () => {
    const limits = await repository();
    const common = {
      clientKey: "d".repeat(64),
      limit: 1,
      windowMs: 60_000,
      now: new Date("2026-07-22T12:00:00.000Z"),
    };

    await expect(limits.take({ ...common, scope: "comments" })).resolves.toEqual({
      allowed: true,
      retryAfter: 0,
    });
    await expect(limits.take({ ...common, scope: "analytics" })).resolves.toEqual({
      allowed: true,
      retryAfter: 0,
    });
  });
});
