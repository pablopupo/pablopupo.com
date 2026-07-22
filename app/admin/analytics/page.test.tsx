import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAdminRouteState: vi.fn(),
}));

vi.mock("../admin-route", () => ({
  loadAdminRouteState: mocks.loadAdminRouteState,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analytics admin page", () => {
  it("renders the dashboard only for the authorized owner", async () => {
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "authorized" });
    const module = await import("./page").catch(() => undefined);
    expect(module?.default).toBeTypeOf("function");

    const html = renderToStaticMarkup(await module!.default());

    expect(html).toContain("Traffic analytics");
    expect(html).toContain("Loading analytics");
    expect(html).toContain('href="/admin/analytics" aria-current="page"');
  });

  it("renders the existing access state when signed out", async () => {
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "signed-out" });
    const module = await import("./page").catch(() => undefined);
    expect(module?.default).toBeTypeOf("function");

    const html = renderToStaticMarkup(await module!.default());

    expect(html).toContain("Sign in with GitHub");
    expect(html).not.toContain("Loading analytics");
  });
});
