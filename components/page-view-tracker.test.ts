import { describe, expect, it, vi } from "vitest";
import PageViewTracker, {
  buildPageViewEvent,
  getAnalyticsSessionId,
  isCanonicalAnalyticsOrigin,
  sendPageView,
} from "./page-view-tracker";

const storedSession = "11111111-1111-4111-8111-111111111111";
const generatedSession = "22222222-2222-4222-8222-222222222222";

function storage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe("page-view tracker", () => {
  it("exports a client component", () => {
    expect(PageViewTracker).toBeTypeOf("function");
  });

  it("collects first-party events only on the canonical production origin", () => {
    expect(isCanonicalAnalyticsOrigin("https://pablopupo.com")).toBe(true);
    expect(isCanonicalAnalyticsOrigin("http://localhost:3000")).toBe(false);
    expect(
      isCanonicalAnalyticsOrigin("https://pablopupo-git-preview.vercel.app")
    ).toBe(false);
  });

  it("reuses a valid per-tab session UUID", () => {
    const sessionStorage = storage(storedSession);
    const randomUUID = vi.fn(() => generatedSession);

    expect(getAnalyticsSessionId(sessionStorage, randomUUID)).toBe(storedSession);
    expect(randomUUID).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it("replaces invalid session storage and remains usable if storage is blocked", () => {
    const sessionStorage = storage("not-a-uuid");
    expect(
      getAnalyticsSessionId(sessionStorage, () => generatedSession)
    ).toBe(generatedSession);
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      "pablopupo.analytics.session",
      generatedSession
    );

    const blockedStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(),
    };
    expect(
      getAnalyticsSessionId(blockedStorage, () => generatedSession)
    ).toBe(generatedSession);
  });

  it("builds only allowlisted bounded browser data and strips referrer secrets", () => {
    const payload = buildPageViewEvent({
      path: "/writing/serving-notes",
      referrer: "https://search.example/results?q=private#fragment",
      sessionId: storedSession,
      viewportWidth: 1440.8,
      viewportHeight: 900.2,
      language: "en-US",
      timezone: "America/New_York",
      search:
        "?utm_source=linkedin&utm_medium=social&utm_campaign=launch&utm_content=profile&utm_term=ai&token=secret",
    });

    expect(payload).toEqual({
      eventName: "page_view",
      path: "/writing/serving-notes",
      referrer: "https://search.example/results",
      sessionId: storedSession,
      properties: {
        viewportWidth: 1440,
        viewportHeight: 900,
        language: "en-US",
        timezone: "America/New_York",
        utmSource: "linkedin",
        utmMedium: "social",
        utmCampaign: "launch",
        utmContent: "profile",
        utmTerm: "ai",
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(/token|userAgent|ipAddress|cookie/);
  });

  it.each([
    ["admin", "/admin"],
    ["API", "/api/analytics"],
    ["framework", "/_next/static/chunk.js"],
    ["external", "https://attacker.example/"],
    ["oversized", `/${"x".repeat(512)}`],
  ])("does not build an event for a %s path", (_description, path) => {
    expect(
      buildPageViewEvent({
        path,
        referrer: "",
        sessionId: storedSession,
        viewportWidth: 1440,
        viewportHeight: 900,
        language: "en-US",
        timezone: "America/New_York",
        search: "",
      })
    ).toBeUndefined();
  });

  it("uses sendBeacon first and does not duplicate the request", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    const fetcher = vi.fn();
    const payload = buildPageViewEvent({
      path: "/",
      referrer: "",
      sessionId: storedSession,
      viewportWidth: 1280,
      viewportHeight: 720,
      language: "en-US",
      timezone: "America/New_York",
      search: "",
    })!;

    await sendPageView(payload, { sendBeacon, fetcher });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]![0]).toBe("/api/analytics");
    const blob = sendBeacon.mock.calls[0]![1] as Blob;
    expect(blob.type).toBe("application/json");
    await expect(blob.text()).resolves.toContain('"eventName":"page_view"');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to keepalive fetch and ignores network failure", async () => {
    const payload = buildPageViewEvent({
      path: "/about",
      referrer: "",
      sessionId: storedSession,
      viewportWidth: 1280,
      viewportHeight: 720,
      language: "en-US",
      timezone: "America/New_York",
      search: "",
    })!;
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(
      sendPageView(payload, {
        sendBeacon: vi.fn().mockReturnValue(false),
        fetcher,
      })
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/analytics",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
      })
    );
  });
});
