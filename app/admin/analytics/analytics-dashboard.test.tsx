import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AnalyticsDashboard, {
  AnalyticsReport,
  loadAnalyticsDashboard,
  type AnalyticsDashboardData,
} from "./analytics-dashboard";

const analytics: AnalyticsDashboardData = {
  range: { days: 30, from: "2026-06-23", through: "2026-07-22" },
  totals: { pageViews: 1240, sessions: 418, directViews: 93 },
  topPaths: [
    { path: "/writing/retrieval-evaluation", views: 311 },
    { path: "/", views: 204 },
  ],
  topReferrers: [
    { referrer: "https://github.com/pablopupo", views: 88 },
    { referrer: "https://www.google.com/", views: 51 },
  ],
  daily: [
    { day: "2026-07-20", views: 10 },
    { day: "2026-07-21", views: 0 },
    { day: "2026-07-22", views: 24 },
  ],
};

describe("analytics dashboard", () => {
  it("loads a bounded owner dashboard without browser caching", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ analytics }, { headers: { "content-type": "application/json" } })
    );

    await expect(loadAnalyticsDashboard(30, fetcher)).resolves.toEqual(analytics);
    expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics?days=30", {
      cache: "no-store",
    });
  });

  it("reports a generic load failure", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ error: "request failed" }, { status: 500 }));

    await expect(loadAnalyticsDashboard(30, fetcher)).rejects.toThrow(
      "Could not load analytics (500)"
    );
  });

  it("renders totals, top paths, referrers, and recent daily counts", () => {
    const html = renderToStaticMarkup(<AnalyticsReport analytics={analytics} />);

    expect(html).toContain("1,240");
    expect(html).toContain("418");
    expect(html).toContain("Tab sessions");
    expect(html).toContain("/writing/retrieval-evaluation");
    expect(html).toContain("https://github.com/pablopupo");
    expect(html).toContain("2026-07-22");
    expect(html).toContain("24 views");
    expect(html).toContain("aria-label=\"Daily page views\"");
    const dashboardHtml = renderToStaticMarkup(<AnalyticsDashboard />);
    expect(dashboardHtml).toContain("background: var(--surface)");
    expect(dashboardHtml).not.toContain("--paper");
    expect(dashboardHtml).toContain("Raw IP addresses are");
    expect(dashboardHtml).toContain("never stored");
  });

  it("renders useful empty states", () => {
    const html = renderToStaticMarkup(
      <AnalyticsReport
        analytics={{
          ...analytics,
          totals: { pageViews: 0, sessions: 0, directViews: 0 },
          topPaths: [],
          topReferrers: [],
          daily: analytics.daily.map((day) => ({ ...day, views: 0 })),
        }}
      />
    );

    expect(html).toContain("No page views in this period");
    expect(html).toContain("No referrers in this period");
  });
});
