import { describe, expect, it } from "vitest";
import { parsePageViewEvent } from "./validation";

const sessionId = "11111111-1111-4111-8111-111111111111";

function validEvent() {
  return {
    eventName: "page_view",
    path: "/writing/serving-notes",
    referrer: "https://news.ycombinator.com/item?id=123#comments",
    sessionId,
    properties: {
      viewportWidth: 1440,
      viewportHeight: 900,
      language: " en-US ",
      timezone: " America/New_York ",
      utmSource: " linkedin ",
      utmMedium: " social ",
      utmCampaign: " launch ",
      utmContent: " profile ",
      utmTerm: " applied-ai ",
    },
  };
}

describe("page-view analytics validation", () => {
  it("accepts one strict page_view shape and removes referrer query secrets", () => {
    expect(parsePageViewEvent(validEvent())).toEqual({
      eventName: "page_view",
      path: "/writing/serving-notes",
      referrer: "https://news.ycombinator.com/item",
      sessionId,
      properties: {
        viewportWidth: 1440,
        viewportHeight: 900,
        language: "en-US",
        timezone: "America/New_York",
        utmSource: "linkedin",
        utmMedium: "social",
        utmCampaign: "launch",
        utmContent: "profile",
        utmTerm: "applied-ai",
      },
    });
  });

  it.each([
    ["another event", { ...validEvent(), eventName: "click" }],
    ["unknown top-level data", { ...validEvent(), userAgent: "browser" }],
    ["unknown properties", {
      ...validEvent(),
      properties: { ...validEvent().properties, email: "person@example.com" },
    }],
    ["an absolute path", { ...validEvent(), path: "https://example.com/about" }],
    ["a protocol-relative path", { ...validEvent(), path: "//attacker.example/x" }],
    ["a path with a query", { ...validEvent(), path: "/writing?token=secret" }],
    ["a private admin path", { ...validEvent(), path: "/admin/profile" }],
    ["a private API path", { ...validEvent(), path: "/api/admin/settings" }],
    ["an oversized path", { ...validEvent(), path: `/${"x".repeat(512)}` }],
    ["a non-v4 session ID", {
      ...validEvent(),
      sessionId: "11111111-1111-1111-8111-111111111111",
    }],
    ["a non-http referrer", { ...validEvent(), referrer: "file:///tmp/resume" }],
    ["an oversized viewport", {
      ...validEvent(),
      properties: { ...validEvent().properties, viewportWidth: 10001 },
    }],
    ["an oversized property", {
      ...validEvent(),
      properties: { ...validEvent().properties, utmCampaign: "x".repeat(201) },
    }],
  ])("rejects %s", (_description, input) => {
    expect(parsePageViewEvent(input)).toBeUndefined();
  });

  it("uses empty properties and no referrer when optional data is absent", () => {
    expect(
      parsePageViewEvent({
        eventName: "page_view",
        path: "/",
        sessionId,
      })
    ).toEqual({
      eventName: "page_view",
      path: "/",
      referrer: null,
      sessionId,
      properties: {},
    });
  });
});
