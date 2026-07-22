"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { siteUrl } from "@/lib/site";

const sessionStorageKey = "pablopupo.analytics.session";
const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type BrowserPageViewInput = {
  path: string;
  referrer: string;
  sessionId: string;
  viewportWidth: number;
  viewportHeight: number;
  language: string;
  timezone: string;
  search: string;
};

export type BrowserPageViewEvent = {
  eventName: "page_view";
  path: string;
  referrer: string | null;
  sessionId: string;
  properties: {
    viewportWidth?: number;
    viewportHeight?: number;
    language?: string;
    timezone?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
  };
};

export function isCanonicalAnalyticsOrigin(value: string) {
  try {
    return new URL(value).origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}

function boundedString(value: string, maximum: number) {
  const normalized = value.trim().slice(0, maximum);
  return normalized || undefined;
}

function boundedDimension(value: number) {
  if (!Number.isFinite(value) || value < 1 || value > 10_000) return undefined;
  return Math.floor(value);
}

function publicPath(path: string) {
  if (path.length < 1 || path.length > 512) return undefined;
  if (!path.startsWith("/") || path.startsWith("//")) return undefined;
  if (/[?#\\\u0000-\u001f\u007f]/.test(path)) return undefined;
  if (
    ["/admin", "/api", "/_next"].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    )
  ) {
    return undefined;
  }
  return path;
}

function safeReferrer(referrer: string) {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const normalized = `${url.origin}${url.pathname}`;
    return normalized.length <= 512 ? normalized : null;
  } catch {
    return null;
  }
}

export function getAnalyticsSessionId(
  storage: SessionStorageLike,
  randomUUID: () => string
) {
  try {
    const stored = storage.getItem(sessionStorageKey);
    if (stored && sessionIdPattern.test(stored)) return stored;
  } catch {
    return randomUUID();
  }

  const sessionId = randomUUID();
  try {
    storage.setItem(sessionStorageKey, sessionId);
  } catch {
    return sessionId;
  }
  return sessionId;
}

export function buildPageViewEvent(
  input: BrowserPageViewInput
): BrowserPageViewEvent | undefined {
  const path = publicPath(input.path);
  if (!path || !sessionIdPattern.test(input.sessionId)) return undefined;
  const search = new URLSearchParams(input.search);
  const utm = (name: string) => boundedString(search.get(name) ?? "", 200);
  return {
    eventName: "page_view",
    path,
    referrer: safeReferrer(input.referrer),
    sessionId: input.sessionId,
    properties: {
      viewportWidth: boundedDimension(input.viewportWidth),
      viewportHeight: boundedDimension(input.viewportHeight),
      language: boundedString(input.language, 35),
      timezone: boundedString(input.timezone, 100),
      utmSource: utm("utm_source"),
      utmMedium: utm("utm_medium"),
      utmCampaign: utm("utm_campaign"),
      utmContent: utm("utm_content"),
      utmTerm: utm("utm_term"),
    },
  };
}

type PageViewTransport = {
  sendBeacon?: (url: string, data: Blob) => boolean;
  fetcher: typeof fetch;
};

export async function sendPageView(
  event: BrowserPageViewEvent,
  transport: PageViewTransport
) {
  const body = JSON.stringify(event);
  if (
    transport.sendBeacon?.(
      "/api/analytics",
      new Blob([body], { type: "application/json" })
    )
  ) {
    return;
  }
  await transport
    .fetcher("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    })
    .then(() => undefined)
    .catch(() => undefined);
}

function resolvedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return;
    if (!isCanonicalAnalyticsOrigin(window.location.origin)) return;
    lastPath.current = pathname;
    const sessionId = getAnalyticsSessionId(
      window.sessionStorage,
      () => window.crypto.randomUUID()
    );
    const event = buildPageViewEvent({
      path: pathname,
      referrer: document.referrer,
      sessionId,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      language: navigator.language,
      timezone: resolvedTimezone(),
      search: window.location.search,
    });
    if (!event) return;
    void sendPageView(event, {
      sendBeacon: navigator.sendBeacon?.bind(navigator),
      fetcher: fetch,
    });
  }, [pathname]);

  return null;
}
