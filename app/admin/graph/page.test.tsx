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

describe("Graph admin page", () => {
  it("renders the graph editor for the configured owner", async () => {
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "authorized" });
    const page = await import("./page").catch(() => undefined);
    expect(page).toBeDefined();

    const html = renderToStaticMarkup(await page!.default());

    expect(html).toContain("Living map nodes, connections, and suggestions");
    expect(html).toContain("Add concept");
  });

  it("renders the shared access boundary when signed out", async () => {
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "signed-out" });
    const page = await import("./page").catch(() => undefined);
    expect(page).toBeDefined();

    const html = renderToStaticMarkup(await page!.default());

    expect(html).toContain("Sign in with GitHub");
    expect(html).not.toContain("Add concept");
  });
});
