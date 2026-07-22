import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publicHandlers: { record: vi.fn() },
  adminHandlers: { load: vi.fn() },
  withAnalyticsHandlers: vi.fn(),
  withAdminAnalyticsHandlers: vi.fn(),
}));

vi.mock("@/lib/analytics/server", () => ({
  withAnalyticsHandlers: mocks.withAnalyticsHandlers,
  withAdminAnalyticsHandlers: mocks.withAdminAnalyticsHandlers,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publicHandlers.record.mockResolvedValue(new Response(null, { status: 204 }));
  mocks.adminHandlers.load.mockResolvedValue(Response.json({ analytics: {} }));
  mocks.withAnalyticsHandlers.mockImplementation(
    (operation: (handlers: typeof mocks.publicHandlers) => Promise<Response>) =>
      operation(mocks.publicHandlers)
  );
  mocks.withAdminAnalyticsHandlers.mockImplementation(
    (operation: (handlers: typeof mocks.adminHandlers) => Promise<Response>) =>
      operation(mocks.adminHandlers)
  );
});

describe("analytics API routes", () => {
  it("delegates the public POST request unchanged", async () => {
    const route = await import("./route").catch(() => undefined);
    expect(route?.POST).toBeTypeOf("function");
    const request = new Request("https://example.com/api/analytics", {
      method: "POST",
      headers: { origin: "https://example.com" },
      body: "{}",
    });

    const response = await route!.POST(request);

    expect(response.status).toBe(204);
    expect(mocks.publicHandlers.record).toHaveBeenCalledWith(request);
  });

  it("delegates the owner GET request unchanged", async () => {
    const route = await import("../admin/analytics/route").catch(() => undefined);
    expect(route?.GET).toBeTypeOf("function");
    const request = new Request("https://example.com/api/admin/analytics?days=30");

    const response = await route!.GET(request);

    expect(response.status).toBe(200);
    expect(mocks.adminHandlers.load).toHaveBeenCalledWith(request);
  });
});
