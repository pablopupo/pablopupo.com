import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getAdminAccess: vi.fn(),
  readAdminConfiguration: vi.fn(),
  createAnalyticsRepository: vi.fn(),
  createAnalyticsHandlers: vi.fn(),
  createAdminAnalyticsHandlers: vi.fn(),
  createRateLimitRepository: vi.fn(),
  createRequestRateLimiter: vi.fn(),
  readRateLimitSecret: vi.fn(),
}));

vi.mock("../db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("../admin/access", () => ({ getAdminAccess: mocks.getAdminAccess }));
vi.mock("../admin/auth", () => ({
  readAdminConfiguration: mocks.readAdminConfiguration,
}));
vi.mock("./repository", () => ({
  createAnalyticsRepository: mocks.createAnalyticsRepository,
}));
vi.mock("../rate-limit/repository", () => ({
  createRateLimitRepository: mocks.createRateLimitRepository,
}));
vi.mock("../rate-limit/service", () => ({
  createRequestRateLimiter: mocks.createRequestRateLimiter,
  readRateLimitSecret: mocks.readRateLimitSecret,
}));
vi.mock("./handlers", async (importOriginal) => {
  const original = await importOriginal<typeof import("./handlers")>();
  return {
    ...original,
    createAnalyticsHandlers: mocks.createAnalyticsHandlers,
    createAdminAnalyticsHandlers: mocks.createAdminAnalyticsHandlers,
  };
});

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalSecret = process.env.BETTER_AUTH_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgres://configured";
  process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  mocks.readRateLimitSecret.mockReturnValue(process.env.BETTER_AUTH_SECRET);
  mocks.getDatabase.mockReturnValue({ database: true });
  mocks.createAnalyticsRepository.mockReturnValue({ repository: true });
  mocks.createRateLimitRepository.mockReturnValue({ buckets: true });
  mocks.createRequestRateLimiter.mockReturnValue({ take: vi.fn() });
  mocks.readAdminConfiguration.mockReturnValue({ databaseUrl: "postgres://configured" });
  mocks.createAnalyticsHandlers.mockReturnValue({ publicHandler: true });
  mocks.createAdminAnalyticsHandlers.mockReturnValue({ adminHandler: true });
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = originalSecret;
});

describe("analytics server wiring", () => {
  it("keeps the public collector build-safe when the database is absent", async () => {
    delete process.env.DATABASE_URL;
    const { withAnalyticsHandlers } = await import("./server").catch(
      () => ({ withAnalyticsHandlers: undefined })
    );
    expect(withAnalyticsHandlers).toBeTypeOf("function");
    const operation = vi.fn();

    const response = await withAnalyticsHandlers!(operation);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "service unavailable" });
    expect(operation).not.toHaveBeenCalled();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("keeps the public collector unavailable when the HMAC secret is absent", async () => {
    mocks.readRateLimitSecret.mockReturnValue(undefined);
    const { withAnalyticsHandlers } = await import("./server");
    const operation = vi.fn();

    const response = await withAnalyticsHandlers(operation);

    expect(response.status).toBe(503);
    expect(operation).not.toHaveBeenCalled();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("wires a bounded public handler without request fingerprint fields", async () => {
    const { withAnalyticsHandlers } = await import("./server");
    const operation = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    const response = await withAnalyticsHandlers(operation);

    expect(response.status).toBe(204);
    expect(mocks.createAnalyticsRepository).toHaveBeenCalledWith({ database: true });
    expect(operation).toHaveBeenCalledWith({ publicHandler: true });
    const dependencies = mocks.createAnalyticsHandlers.mock.calls[0]![0];
    expect(Object.keys(dependencies).sort()).toEqual([
      "isSameOrigin",
      "now",
      "rateLimit",
      "repository",
    ]);
    expect(mocks.createRateLimitRepository).toHaveBeenCalledWith({ database: true });
    expect(JSON.stringify(dependencies)).not.toMatch(/userAgent|ipAddress|cookie/i);
    expect(
      dependencies.isSameOrigin(
        new Request("https://pablopupo.com/api/analytics", {
          headers: { origin: "https://pablopupo.com" },
        })
      )
    ).toBe(true);
    expect(
      dependencies.isSameOrigin(
        new Request("https://preview.example/api/analytics", {
          headers: { origin: "https://preview.example" },
        })
      )
    ).toBe(false);
    const now = new Date("2026-07-22T12:00:00Z");
    const request = new Request("https://pablopupo.com/api/analytics");
    await dependencies.rateLimit(request, now);
    expect(mocks.createRequestRateLimiter.mock.results[0]!.value.take).toHaveBeenCalledWith(
      "analytics",
      request,
      now
    );
  });

  it("requires full owner configuration before wiring the read handler", async () => {
    mocks.readAdminConfiguration.mockReturnValue(undefined);
    const { withAdminAnalyticsHandlers } = await import("./server");
    const operation = vi.fn();

    const response = await withAdminAnalyticsHandlers(operation);

    expect(response.status).toBe(503);
    expect(operation).not.toHaveBeenCalled();
  });

  it("wires owner authorization into the aggregate reader", async () => {
    const { withAdminAnalyticsHandlers } = await import("./server");
    const operation = vi.fn().mockResolvedValue(Response.json({ ok: true }));

    await withAdminAnalyticsHandlers(operation);

    expect(operation).toHaveBeenCalledWith({ adminHandler: true });
    expect(mocks.createAdminAnalyticsHandlers).toHaveBeenCalledWith(
      expect.objectContaining({
        authorize: mocks.getAdminAccess,
        repository: { repository: true },
      })
    );
  });
});
