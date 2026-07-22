"use client";

import {
  Analytics,
  type BeforeSendEvent,
} from "@vercel/analytics/next";

export function filterVercelAnalyticsEvent(event: BeforeSendEvent) {
  try {
    const pathname = new URL(event.url, "https://pablopupo.com").pathname;
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  } catch {
    return event;
  }
  return event;
}

export default function VercelAnalytics() {
  return <Analytics beforeSend={filterVercelAnalyticsEvent} />;
}
