import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "../db/test-database";
import type { PageViewEvent } from "./validation";

const sessions = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
] as const;

let client: PGlite | undefined;

async function repository() {
  if (!client) throw new Error("Repository test database is unavailable");
  const module = await import("./repository").catch(() => undefined);
  expect(module?.createAnalyticsRepository).toBeTypeOf("function");
  return module!.createAnalyticsRepository(drizzle(client, { schema }));
}

function event(
  path: string,
  sessionId: string,
  referrer: string | null = null
): PageViewEvent {
  return {
    eventName: "page_view",
    path,
    referrer,
    sessionId,
    properties: { language: "en-US", viewportWidth: 1440 },
  };
}

beforeAll(async () => {
  client = await createMigratedDatabase();
  expect(client, "generated SQL migrations").toBeDefined();
}, PGLITE_TEST_TIMEOUT_MS);

afterEach(async () => {
  await client?.exec(
    "TRUNCATE TABLE analytics_events, analytics_daily_aggregates, entries CASCADE"
  );
}, PGLITE_TEST_TIMEOUT_MS);

afterAll(async () => {
  await client?.close();
}, PGLITE_TEST_TIMEOUT_MS);

describe.sequential("analytics repository", () => {
  it("accepts only static public routes and published or due entry paths", async () => {
    const analytics = await repository();
    await client!.exec(
      `INSERT INTO entries
         (slug, section, status, title, body_markdown, published_at)
       VALUES
         ('public-note', 'writing', 'published', 'Public', '', '2026-07-20T12:00:00Z'),
         ('due-piece', 'music', 'scheduled', 'Due', '', '2026-07-22T11:00:00Z'),
         ('future-note', 'writing', 'scheduled', 'Future', '', '2026-07-23T12:00:00Z'),
         ('draft-note', 'writing', 'draft', 'Draft', '', NULL)`
    );
    const now = new Date("2026-07-22T12:00:00Z");

    for (const path of ["/", "/work", "/writing", "/music", "/about", "/search"]) {
      await expect(analytics.isTrackablePath(path, now)).resolves.toBe(true);
    }
    await expect(analytics.isTrackablePath("/writing/public-note", now)).resolves.toBe(
      true
    );
    await expect(analytics.isTrackablePath("/music/due-piece", now)).resolves.toBe(true);
    await expect(analytics.isTrackablePath("/music/public-note", now)).resolves.toBe(false);
    await expect(analytics.isTrackablePath("/writing/future-note", now)).resolves.toBe(
      false
    );
    await expect(analytics.isTrackablePath("/writing/draft-note", now)).resolves.toBe(
      false
    );
    await expect(analytics.isTrackablePath("/writing/random", now)).resolves.toBe(false);
    await expect(analytics.isTrackablePath("/resume", now)).resolves.toBe(false);
  });

  it("uses one atomic statement on databases without callback transactions", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn().mockRejectedValue(
      new Error("No transactions support in neon-http driver")
    );
    const module = await import("./repository");
    const analytics = module.createAnalyticsRepository({
      execute,
      transaction,
    } as never);

    await expect(
      analytics.recordPageView(
        event("/about", sessions[0]),
        new Date("2026-07-22T12:00:00.000Z")
      )
    ).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("records a private page view and increments its UTC daily aggregate", async () => {
    const analytics = await repository();
    const occurredAt = new Date("2026-07-22T23:30:00.000Z");

    await analytics.recordPageView(
      event(
        "/writing/serving-notes",
        sessions[0],
        "https://news.ycombinator.com/item"
      ),
      occurredAt
    );
    await analytics.recordPageView(
      event(
        "/writing/serving-notes",
        sessions[0],
        "https://news.ycombinator.com/item"
      ),
      occurredAt
    );

    const events = await client!.query<Record<string, unknown>>(
      `SELECT event_name, path, referrer, session_id, properties, occurred_at
       FROM analytics_events
       ORDER BY occurred_at, id`
    );
    const daily = await client!.query<Record<string, unknown>>(
      `SELECT day::text, event_name, path, event_count::int
       FROM analytics_daily_aggregates`
    );

    expect(events.rows).toHaveLength(2);
    expect(events.rows[0]).toMatchObject({
      event_name: "page_view",
      path: "/writing/serving-notes",
      referrer: "https://news.ycombinator.com/item",
      session_id: sessions[0],
      properties: { language: "en-US", viewportWidth: 1440 },
    });
    expect(daily.rows).toEqual([
      {
        day: "2026-07-22",
        event_name: "page_view",
        path: "/writing/serving-notes",
        event_count: 2,
      },
    ]);
    expect(JSON.stringify(events.rows)).not.toMatch(/user.?agent|ip.?address/i);
  });

  it("prunes raw events older than 90 days while retaining daily counts", async () => {
    const analytics = await repository();
    await analytics.recordPageView(
      event("/old-note", sessions[0]),
      new Date("2026-04-01T12:00:00.000Z")
    );
    await analytics.recordPageView(
      event("/current-note", sessions[1]),
      new Date("2026-07-22T12:00:00.000Z")
    );

    const events = await client!.query<{ path: string }>(
      "SELECT path FROM analytics_events ORDER BY path"
    );
    const daily = await client!.query<{ path: string }>(
      "SELECT path FROM analytics_daily_aggregates ORDER BY path"
    );

    expect(events.rows).toEqual([{ path: "/current-note" }]);
    expect(daily.rows).toEqual([
      { path: "/current-note" },
      { path: "/old-note" },
    ]);
  });

  it("returns grouped owner metrics for a bounded recent window", async () => {
    const analytics = await repository();
    await analytics.recordPageView(
      event("/", sessions[0]),
      new Date("2026-07-20T10:00:00.000Z")
    );
    await analytics.recordPageView(
      event(
        "/writing/serving-notes",
        sessions[0],
        "https://news.ycombinator.com/item"
      ),
      new Date("2026-07-21T10:00:00.000Z")
    );
    await analytics.recordPageView(
      event(
        "/writing/serving-notes",
        sessions[1],
        "https://news.ycombinator.com/item"
      ),
      new Date("2026-07-22T10:00:00.000Z")
    );
    await analytics.recordPageView(
      event("/music/nocturne", sessions[2], "https://www.google.com/"),
      new Date("2026-07-22T11:00:00.000Z")
    );
    await analytics.recordPageView(
      event("/older", sessions[2]),
      new Date("2026-06-01T11:00:00.000Z")
    );

    const dashboard = await analytics.readDashboard(
      4,
      new Date("2026-07-22T15:00:00.000Z")
    );

    expect(dashboard).toEqual({
      range: { days: 4, from: "2026-07-19", through: "2026-07-22" },
      totals: { pageViews: 4, sessions: 3, directViews: 1 },
      topPaths: [
        { path: "/writing/serving-notes", views: 2 },
        { path: "/", views: 1 },
        { path: "/music/nocturne", views: 1 },
      ],
      topReferrers: [
        { referrer: "https://news.ycombinator.com/item", views: 2 },
        { referrer: "https://www.google.com/", views: 1 },
      ],
      daily: [
        { day: "2026-07-19", views: 0 },
        { day: "2026-07-20", views: 1 },
        { day: "2026-07-21", views: 1 },
        { day: "2026-07-22", views: 2 },
      ],
    });
    expect(JSON.stringify(dashboard)).not.toContain(sessions[0]);
    expect(JSON.stringify(dashboard)).not.toContain("properties");
  });
});
