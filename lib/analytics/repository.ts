import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  isNull,
  isNotNull,
  lte,
  or,
  sql,
  sum,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  analyticsDailyAggregates,
  analyticsEvents,
  entries,
} from "../db/schema";
import type * as schema from "../db/schema";
import type { PageViewEvent } from "./validation";

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcRange(days: number, now: Date) {
  const through = utcDay(now);
  const fromDate = new Date(`${through}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - days + 1);
  return { from: utcDay(fromDate), fromDate, through };
}

function fillDaily(
  from: string,
  days: number,
  rows: Array<{ day: string; views: number }>
) {
  const viewsByDay = new Map(rows.map((row) => [row.day, Number(row.views)]));
  const current = new Date(`${from}T00:00:00.000Z`);
  return Array.from({ length: days }, () => {
    const day = utcDay(current);
    current.setUTCDate(current.getUTCDate() + 1);
    return { day, views: viewsByDay.get(day) ?? 0 };
  });
}

const staticPublicPaths = new Set([
  "/",
  "/work",
  "/writing",
  "/music",
  "/about",
  "/search",
]);

function dynamicEntryPath(path: string) {
  const match = /^\/(writing|music)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if (!match) return undefined;
  return {
    section: match[1] as "writing" | "music",
    slug: match[2]!,
  };
}

export function createAnalyticsRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return {
    async isTrackablePath(path: string, now = new Date()) {
      if (staticPublicPaths.has(path)) return true;
      const entryPath = dynamicEntryPath(path);
      if (!entryPath) return false;
      const rows = await database
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(
            eq(entries.section, entryPath.section),
            eq(entries.slug, entryPath.slug),
            or(eq(entries.status, "published"), eq(entries.status, "scheduled")),
            lte(entries.publishedAt, now)
          )
        )
        .limit(1);
      return rows.length === 1;
    },

    async recordPageView(event: PageViewEvent, occurredAt = new Date()) {
      const day = utcDay(occurredAt);
      await database.execute(sql`
        WITH pruned_events AS (
          DELETE FROM "analytics_events"
          WHERE "occurred_at" < ${occurredAt}::timestamptz - INTERVAL '90 days'
        ), inserted_event AS (
          INSERT INTO "analytics_events"
            ("event_name", "path", "referrer", "session_id", "properties", "occurred_at")
          VALUES (
            ${event.eventName},
            ${event.path},
            ${event.referrer},
            ${event.sessionId},
            ${JSON.stringify(event.properties)}::jsonb,
            ${occurredAt}
          )
          RETURNING 1
        )
        INSERT INTO "analytics_daily_aggregates"
          ("day", "event_name", "path", "event_count", "updated_at")
        SELECT ${day}, ${event.eventName}, ${event.path}, 1, ${occurredAt}
        FROM inserted_event
        ON CONFLICT ("day", "event_name", "path") DO UPDATE SET
          "event_count" = "analytics_daily_aggregates"."event_count" + 1,
          "updated_at" = EXCLUDED."updated_at"
      `);
    },

    async readDashboard(days: number, now = new Date()) {
      const { from, fromDate, through } = utcRange(days, now);
      const aggregateRange = and(
        eq(analyticsDailyAggregates.eventName, "page_view"),
        gte(analyticsDailyAggregates.day, from),
        lte(analyticsDailyAggregates.day, through)
      );
      const eventRange = and(
        eq(analyticsEvents.eventName, "page_view"),
        gte(analyticsEvents.occurredAt, fromDate),
        lte(analyticsEvents.occurredAt, now)
      );
      const totalViews = sum(analyticsDailyAggregates.eventCount).mapWith(Number);
      const pathViews = sum(analyticsDailyAggregates.eventCount).mapWith(Number);
      const dailyViews = sum(analyticsDailyAggregates.eventCount).mapWith(Number);
      const referrerViews = count(analyticsEvents.id);

      const [
        totalRows,
        sessionRows,
        directRows,
        pathRows,
        referrerRows,
        dailyRows,
      ] = await Promise.all([
        database
          .select({ views: totalViews })
          .from(analyticsDailyAggregates)
          .where(aggregateRange),
        database
          .select({ sessions: countDistinct(analyticsEvents.sessionId) })
          .from(analyticsEvents)
          .where(eventRange),
        database
          .select({ views: count(analyticsEvents.id) })
          .from(analyticsEvents)
          .where(and(eventRange, isNull(analyticsEvents.referrer))),
        database
          .select({
            path: analyticsDailyAggregates.path,
            views: pathViews,
          })
          .from(analyticsDailyAggregates)
          .where(aggregateRange)
          .groupBy(analyticsDailyAggregates.path)
          .orderBy(desc(pathViews), asc(analyticsDailyAggregates.path))
          .limit(10),
        database
          .select({
            referrer: analyticsEvents.referrer,
            views: referrerViews,
          })
          .from(analyticsEvents)
          .where(and(eventRange, isNotNull(analyticsEvents.referrer)))
          .groupBy(analyticsEvents.referrer)
          .orderBy(desc(referrerViews), asc(analyticsEvents.referrer))
          .limit(10),
        database
          .select({
            day: analyticsDailyAggregates.day,
            views: dailyViews,
          })
          .from(analyticsDailyAggregates)
          .where(aggregateRange)
          .groupBy(analyticsDailyAggregates.day)
          .orderBy(asc(analyticsDailyAggregates.day)),
      ]);

      return {
        range: { days, from, through },
        totals: {
          pageViews: Number(totalRows[0]?.views ?? 0),
          sessions: Number(sessionRows[0]?.sessions ?? 0),
          directViews: Number(directRows[0]?.views ?? 0),
        },
        topPaths: pathRows.map((row) => ({
          path: row.path,
          views: Number(row.views),
        })),
        topReferrers: referrerRows.map((row) => ({
          referrer: row.referrer!,
          views: Number(row.views),
        })),
        daily: fillDaily(
          from,
          days,
          dailyRows.map((row) => ({
            day: row.day,
            views: Number(row.views),
          }))
        ),
      };
    },
  };
}

export type AnalyticsDashboard = Awaited<
  ReturnType<ReturnType<typeof createAnalyticsRepository>["readDashboard"]>
>;
