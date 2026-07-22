"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../admin-shell";

export type AnalyticsDashboardData = {
  range: { days: number; from: string; through: string };
  totals: { pageViews: number; sessions: number; directViews: number };
  topPaths: Array<{ path: string; views: number }>;
  topReferrers: Array<{ referrer: string; views: number }>;
  daily: Array<{ day: string; views: number }>;
};

function isAnalyticsDashboard(value: unknown): value is AnalyticsDashboardData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AnalyticsDashboardData>;
  return (
    Boolean(candidate.range && candidate.totals) &&
    Array.isArray(candidate.topPaths) &&
    Array.isArray(candidate.topReferrers) &&
    Array.isArray(candidate.daily)
  );
}

export async function loadAnalyticsDashboard(
  days: 7 | 30 | 90,
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher(`/api/admin/analytics?days=${days}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    analytics?: unknown;
  } | null;
  if (!response.ok || !isAnalyticsDashboard(payload?.analytics)) {
    throw new Error(`Could not load analytics (${response.status})`);
  }
  return payload.analytics;
}

function count(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function AnalyticsReport({
  analytics,
}: {
  analytics: AnalyticsDashboardData;
}) {
  const maximumDaily = Math.max(1, ...analytics.daily.map((item) => item.views));
  return (
    <div className="analytics-report">
      <p className="analytics-range">
        {analytics.range.from} through {analytics.range.through}
      </p>
      <section className="analytics-totals" aria-label="Traffic totals">
        <article>
          <strong>{count(analytics.totals.pageViews)}</strong>
          <span>Page views</span>
        </article>
        <article>
          <strong>{count(analytics.totals.sessions)}</strong>
          <span>Tab sessions</span>
        </article>
        <article>
          <strong>{count(analytics.totals.directViews)}</strong>
          <span>Direct or unknown</span>
        </article>
      </section>

      <section className="analytics-daily">
        <h2>Daily views</h2>
        <div className="analytics-bars" aria-label="Daily page views">
          {analytics.daily.map((item) => (
            <div
              className="analytics-bar-column"
              key={item.day}
              title={`${item.day}: ${item.views} views`}
            >
              <span
                className="analytics-bar"
                style={{
                  height: `${
                    item.views === 0
                      ? 0
                      : Math.max(4, (item.views / maximumDaily) * 100)
                  }%`,
                }}
              />
              <span className="analytics-bar-value">{item.views} views</span>
              <time dateTime={item.day}>{item.day}</time>
            </div>
          ))}
        </div>
      </section>

      <div className="analytics-rankings">
        <section>
          <h2>Top paths</h2>
          {analytics.topPaths.length ? (
            <ol>
              {analytics.topPaths.map((item) => (
                <li key={item.path}>
                  <code>{item.path}</code>
                  <span>{count(item.views)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p>No page views in this period.</p>
          )}
        </section>
        <section>
          <h2>Top referrers</h2>
          {analytics.topReferrers.length ? (
            <ol>
              {analytics.topReferrers.map((item) => (
                <li key={item.referrer}>
                  <span>{item.referrer}</span>
                  <span>{count(item.views)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p>No referrers in this period.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [analytics, setAnalytics] = useState<AnalyticsDashboardData | null>(null);
  const [message, setMessage] = useState("Loading analytics");

  useEffect(() => {
    let active = true;
    setMessage("Loading analytics");
    void loadAnalyticsDashboard(days)
      .then((nextAnalytics) => {
        if (!active) return;
        setAnalytics(nextAnalytics);
        setMessage("");
      })
      .catch(() => {
        if (!active) return;
        setAnalytics(null);
        setMessage("Could not load analytics. Try again.");
      });
    return () => {
      active = false;
    };
  }, [days]);

  return (
    <AdminShell activeTab="analytics" description="Private first-party traffic">
      <section className="analytics-admin">
        <div className="analytics-heading">
          <div>
            <h2>Traffic analytics</h2>
            <p>
              No cookies or user-agent strings are collected. Raw IP addresses are
              never stored; short-lived keyed digests enforce abuse limits.
            </p>
          </div>
          <label>
            Period
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value) as 7 | 30 | 90)}
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        </div>
        {message && <p className="admin-message" role="status">{message}</p>}
        {analytics && <AnalyticsReport analytics={analytics} />}
      </section>
      <style>{`
        .analytics-admin { margin-top: 1.5rem; }
        .analytics-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
        .analytics-heading h2 { margin-bottom: 0.25rem; }
        .analytics-heading p, .analytics-range, .analytics-rankings p { color: var(--muted); font: 0.75rem/1.5 var(--mono); }
        .analytics-heading label { display: grid; gap: 0.35rem; color: var(--muted); font: 0.75rem var(--mono); }
        .analytics-heading select { min-width: 7.5rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--surface); color: var(--ink); padding: 0.45rem; font: inherit; }
        .analytics-range { margin-top: 1.5rem; }
        .analytics-totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 0.75rem; }
        .analytics-totals article { display: grid; gap: 0.2rem; padding: 1rem; border: 1px solid var(--hairline); border-radius: 6px; }
        .analytics-totals strong { font: 600 1.65rem var(--sans); }
        .analytics-totals span { color: var(--muted); font: 0.7rem var(--mono); text-transform: uppercase; letter-spacing: 0.05em; }
        .analytics-daily { margin-top: 2rem; }
        .analytics-daily h2, .analytics-rankings h2 { font-size: 1.05rem; }
        .analytics-bars { display: flex; align-items: stretch; gap: 0.2rem; height: 14rem; margin-top: 0.75rem; padding: 0.75rem 0.5rem 0; border: 1px solid var(--hairline); border-radius: 6px; overflow-x: auto; }
        .analytics-bar-column { display: flex; flex: 1 0 1rem; min-width: 0.65rem; height: 100%; flex-direction: column; justify-content: end; align-items: stretch; }
        .analytics-bar { display: block; min-height: 0; background: var(--accent); border-radius: 2px 2px 0 0; }
        .analytics-bar-value, .analytics-bar-column time { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        .analytics-rankings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem; margin-top: 2rem; }
        .analytics-rankings ol { list-style: none; margin: 0.75rem 0 0; padding: 0; border-top: 1px solid var(--hairline); }
        .analytics-rankings li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.65rem 0; border-bottom: 1px solid var(--hairline); font: 0.75rem/1.4 var(--mono); }
        .analytics-rankings li > :first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 700px) { .analytics-heading { align-items: start; flex-direction: column; } .analytics-totals, .analytics-rankings { grid-template-columns: 1fr; } }
      `}</style>
    </AdminShell>
  );
}
