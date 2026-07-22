import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics/next", () => ({
  Analytics: ({ beforeSend }: { beforeSend: (event: unknown) => unknown }) => (
    <span data-filter={typeof beforeSend}>Vercel analytics</span>
  ),
}));

describe("Vercel analytics", () => {
  it("drops admin page views and keeps public page views", async () => {
    const { filterVercelAnalyticsEvent } = await import("./vercel-analytics");
    const publicEvent = {
      type: "pageview" as const,
      url: "https://pablopupo.com/writing/retrieval-notes",
    };

    expect(filterVercelAnalyticsEvent(publicEvent)).toBe(publicEvent);
    expect(
      filterVercelAnalyticsEvent({
        type: "pageview",
        url: "https://pablopupo.com/admin/analytics",
      })
    ).toBeNull();
    expect(
      filterVercelAnalyticsEvent({ type: "pageview", url: "/admin" })
    ).toBeNull();
  });

  it("passes the filter to the Vercel component", async () => {
    const { default: VercelAnalytics } = await import("./vercel-analytics");

    const html = renderToStaticMarkup(<VercelAnalytics />);

    expect(html).toContain('data-filter="function"');
  });
});
