import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../db/schema";

export type RateLimitScope = "comments" | "analytics";

export type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
};

export type RateLimitTakeInput = {
  scope: RateLimitScope;
  clientKey: string;
  limit: number;
  windowMs: number;
  now: Date;
};

type BucketResult = {
  requestCount: number;
  expiresAt: Date | string;
};

function firstBucket(result: unknown) {
  if (
    !result ||
    typeof result !== "object" ||
    !("rows" in result) ||
    !Array.isArray(result.rows)
  ) {
    throw new Error("Rate-limit query did not return rows");
  }
  return result.rows[0] as BucketResult | undefined;
}

function validateInput(input: RateLimitTakeInput) {
  if (!/^[0-9a-f]{64}$/.test(input.clientKey)) {
    throw new Error("Invalid rate-limit client key");
  }
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error("Invalid rate-limit allowance");
  }
  if (
    !Number.isInteger(input.windowMs) ||
    input.windowMs < 1 ||
    input.windowMs > 10 * 60 * 1_000
  ) {
    throw new Error("Invalid rate-limit window");
  }
  if (Number.isNaN(input.now.getTime())) {
    throw new Error("Invalid rate-limit time");
  }
}

export function createRateLimitRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return {
    async take(input: RateLimitTakeInput): Promise<RateLimitResult> {
      validateInput(input);
      const result = await database.execute<BucketResult>(sql`
        WITH pruned AS (
          DELETE FROM "rate_limit_buckets"
          WHERE "expires_at" <= ${input.now}
            AND ("scope" <> ${input.scope} OR "client_key" <> ${input.clientKey})
        ), bucket AS (
          INSERT INTO "rate_limit_buckets"
            ("scope", "client_key", "window_started_at", "request_count", "expires_at")
          VALUES (
            ${input.scope},
            ${input.clientKey},
            ${input.now},
            1,
            ${input.now}::timestamptz + (${input.windowMs} * INTERVAL '1 millisecond')
          )
          ON CONFLICT ("scope", "client_key") DO UPDATE SET
            "window_started_at" = CASE
              WHEN "rate_limit_buckets"."expires_at" <= ${input.now}
                THEN ${input.now}
              ELSE "rate_limit_buckets"."window_started_at"
            END,
            "request_count" = CASE
              WHEN "rate_limit_buckets"."expires_at" <= ${input.now}
                THEN 1
              ELSE LEAST("rate_limit_buckets"."request_count" + 1, ${input.limit + 1})
            END,
            "expires_at" = CASE
              WHEN "rate_limit_buckets"."expires_at" <= ${input.now}
                THEN ${input.now}::timestamptz + (${input.windowMs} * INTERVAL '1 millisecond')
              ELSE "rate_limit_buckets"."expires_at"
            END
          RETURNING
            "request_count" AS "requestCount",
            "expires_at" AS "expiresAt"
        )
        SELECT "requestCount", "expiresAt" FROM bucket
      `);
      const bucket = firstBucket(result);
      if (!bucket) throw new Error("Rate-limit bucket was not returned");
      const allowed = Number(bucket.requestCount) <= input.limit;
      return {
        allowed,
        retryAfter: allowed
          ? 0
          : Math.max(
              1,
              Math.ceil(
                (new Date(bucket.expiresAt).getTime() - input.now.getTime()) /
                  1_000
              )
            ),
      };
    },
  };
}
