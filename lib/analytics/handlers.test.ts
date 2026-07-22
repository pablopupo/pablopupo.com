import { describe, expect, it, vi } from "vitest";

const sessionId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-07-22T15:00:00.000Z");

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventName: "page_view",
    path: "/writing/serving-notes",
    referrer: "https://search.example/results?q=private",
    sessionId,
    properties: { language: "en-US" },
    ...overrides,
  };
}

function post(
  body: unknown,
  options: {
    origin?: string;
    contentType?: string;
    raw?: string;
    requestUrl?: string;
  } = {}
) {
  const origin = options.origin ?? "https://pablopupo.com";
  const raw = options.raw ?? JSON.stringify(body);
  return new Request(options.requestUrl ?? "https://pablopupo.com/api/analytics", {
    method: "POST",
    headers: {
      ...(origin ? { origin } : {}),
      "content-type": options.contentType ?? "application/json",
    },
    body: raw,
  });
}

async function analyticsModule() {
  const module = await import("./handlers").catch(() => undefined);
  expect(module?.createAnalyticsHandlers).toBeTypeOf("function");
  expect(module?.createAdminAnalyticsHandlers).toBeTypeOf("function");
  expect(module?.hasSameRequestOrigin).toBeTypeOf("function");
  return module!;
}

function publicDependencies(overrides: Record<string, unknown> = {}) {
  return {
    isSameOrigin: vi.fn().mockReturnValue(true),
    now: vi.fn().mockReturnValue(now),
    rateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
    repository: {
      recordPageView: vi.fn().mockResolvedValue(undefined),
      isTrackablePath: vi.fn().mockResolvedValue(true),
    },
    ...overrides,
  };
}

function adminDependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: vi.fn().mockResolvedValue({ status: "authorized", userId: "owner" }),
    now: vi.fn().mockReturnValue(now),
    repository: {
      readDashboard: vi.fn().mockResolvedValue({
        range: { days: 30, from: "2026-06-23", through: "2026-07-22" },
        totals: { pageViews: 10, sessions: 4, directViews: 3 },
        topPaths: [{ path: "/", views: 5 }],
        topReferrers: [{ referrer: "https://github.com/", views: 2 }],
        daily: [{ day: "2026-07-22", views: 2 }],
      }),
    },
    ...overrides,
  };
}

describe("public analytics handler", () => {
  it("recognizes only the canonical production request and origin", async () => {
    const { hasSameRequestOrigin } = await analyticsModule();

    expect(hasSameRequestOrigin(post(event()), "https://pablopupo.com")).toBe(true);
    expect(
      hasSameRequestOrigin(
        post(event(), { origin: "https://attacker.example" }),
        "https://pablopupo.com"
      )
    ).toBe(false);
    expect(
      hasSameRequestOrigin(
        post(event(), {
          origin: "https://preview.example",
          requestUrl: "https://preview.example/api/analytics",
        }),
        "https://pablopupo.com"
      )
    ).toBe(false);
    expect(
      hasSameRequestOrigin(
        new Request("https://pablopupo.com/api/analytics", { method: "POST" }),
        "https://pablopupo.com"
      )
    ).toBe(false);
  });

  it("rejects cross-origin requests before reading or storing an event", async () => {
    const module = await analyticsModule();
    const deps = publicDependencies({ isSameOrigin: vi.fn().mockReturnValue(false) });
    const handlers = module.createAnalyticsHandlers(deps);

    const response = await handlers.record(
      post(event(), { origin: "https://attacker.example" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "request rejected" });
    expect(deps.rateLimit).not.toHaveBeenCalled();
    expect(deps.repository.recordPageView).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-JSON content type", post(event(), { contentType: "text/plain" })],
    ["malformed JSON", post({}, { raw: "{" })],
    ["an unknown event", post(event({ eventName: "click" }))],
    ["private data", post(event({ userAgent: "browser" }))],
    ["an oversized body", post({}, { raw: JSON.stringify({ value: "x".repeat(8_192) }) })],
  ])("rejects %s with no persistence", async (_description, request) => {
    const module = await analyticsModule();
    const deps = publicDependencies();
    const response = await module.createAnalyticsHandlers(deps).record(request);

    expect([413, 415, 422]).toContain(response.status);
    expect(deps.repository.recordPageView).not.toHaveBeenCalled();
  });

  it("cancels a streamed body without Content-Length as soon as it exceeds 8 KiB", async () => {
    const module = await analyticsModule();
    const deps = publicDependencies();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8_192));
        controller.enqueue(new Uint8Array([1]));
        controller.enqueue(new Uint8Array(1_024));
        controller.close();
      },
      cancel,
    });
    const request = new Request("https://pablopupo.com/api/analytics", {
      method: "POST",
      headers: {
        origin: "https://pablopupo.com",
        "content-type": "application/json",
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(request.headers.get("content-length")).toBeNull();

    const response = await module.createAnalyticsHandlers(deps).record(request);

    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(deps.rateLimit).not.toHaveBeenCalled();
    expect(deps.repository.recordPageView).not.toHaveBeenCalled();
  });

  it("stores sanitized data at server time and returns an empty response", async () => {
    const module = await analyticsModule();
    const deps = publicDependencies();

    const response = await module.createAnalyticsHandlers(deps).record(post(event()));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(deps.rateLimit).toHaveBeenCalledWith(expect.any(Request), now);
    expect(deps.repository.isTrackablePath).toHaveBeenCalledWith(
      "/writing/serving-notes",
      now
    );
    expect(deps.repository.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "page_view",
        path: "/writing/serving-notes",
        referrer: "https://search.example/results",
      }),
      now
    );
    expect(
      JSON.stringify(deps.repository.recordPageView.mock.calls[0])
    ).not.toMatch(/fingerprint|ipAddress|userAgent/);
  });

  it("returns a generic rate-limit response without persistence", async () => {
    const module = await analyticsModule();
    const deps = publicDependencies({
      rateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfter: 12 }),
    });

    const response = await module.createAnalyticsHandlers(deps).record(post(event()));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    await expect(response.json()).resolves.toEqual({ error: "request rejected" });
    expect(deps.repository.recordPageView).not.toHaveBeenCalled();
  });

  it("rejects forged paths before recording a permanent aggregate", async () => {
    const module = await analyticsModule();
    const deps = publicDependencies();
    deps.repository.isTrackablePath.mockResolvedValue(false);

    const response = await module
      .createAnalyticsHandlers(deps)
      .record(post(event({ path: "/writing/forged-random-path" })));

    expect(response.status).toBe(422);
    expect(deps.repository.recordPageView).not.toHaveBeenCalled();
  });

  it("returns 503 without persistence when the global limiter is unavailable", async () => {
    const module = await analyticsModule();
    const deps = publicDependencies({
      rateLimit: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });

    const response = await module.createAnalyticsHandlers(deps).record(post(event()));

    expect(response.status).toBe(503);
    expect(deps.repository.recordPageView).not.toHaveBeenCalled();
  });

  it("does not expose storage failures", async () => {
    const module = await analyticsModule();
    const deps = publicDependencies();
    deps.repository.recordPageView.mockRejectedValue(new Error("database secret"));

    const response = await module.createAnalyticsHandlers(deps).record(post(event()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "request failed" });
  });
});

describe("owner analytics handler", () => {
  it.each([
    ["unconfigured", 503],
    ["unauthenticated", 401],
    ["forbidden", 403],
  ])("maps %s access to %i", async (status, expectedStatus) => {
    const module = await analyticsModule();
    const deps = adminDependencies({
      authorize: vi.fn().mockResolvedValue({ status }),
    });

    const response = await module
      .createAdminAnalyticsHandlers(deps)
      .load(new Request("https://example.com/api/admin/analytics"));

    expect(response.status).toBe(expectedStatus);
    expect(deps.repository.readDashboard).not.toHaveBeenCalled();
  });

  it("returns only grouped analytics with a private no-store policy", async () => {
    const module = await analyticsModule();
    const deps = adminDependencies();

    const response = await module
      .createAdminAnalyticsHandlers(deps)
      .load(new Request("https://example.com/api/admin/analytics?days=30"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.repository.readDashboard).toHaveBeenCalledWith(30, now);
    const payload = await response.json();
    expect(payload.analytics.totals).toEqual({
      pageViews: 10,
      sessions: 4,
      directViews: 3,
    });
    expect(JSON.stringify(payload)).not.toMatch(/sessionId|properties|userAgent|ipAddress/);
  });

  it("defaults to 30 days and rejects non-canonical or unknown query input", async () => {
    const module = await analyticsModule();
    const deps = adminDependencies();
    const handlers = module.createAdminAnalyticsHandlers(deps);

    await handlers.load(new Request("https://example.com/api/admin/analytics"));
    expect(deps.repository.readDashboard).toHaveBeenCalledWith(30, now);

    for (const query of ["days=0", "days=91", "days=30.5", "days=030", "range=30"]) {
      deps.repository.readDashboard.mockClear();
      const response = await handlers.load(
        new Request(`https://example.com/api/admin/analytics?${query}`)
      );
      expect(response.status).toBe(422);
      expect(deps.repository.readDashboard).not.toHaveBeenCalled();
    }
  });
});
