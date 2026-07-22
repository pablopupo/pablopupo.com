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

describe("Work admin page", () => {
  it("renders the project editor for the configured owner", async () => {
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "authorized" });
    const page = await import("./page").catch(() => undefined);
    expect(page).toBeDefined();

    const html = renderToStaticMarkup(await page!.default());

    expect(html).toContain("Projects, experience, technologies, and links");
    expect(html).toContain("Create draft");
  });

  it("renders the shared access boundary when signed out", async () => {
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "signed-out" });
    const page = await import("./page").catch(() => undefined);
    expect(page).toBeDefined();

    const html = renderToStaticMarkup(await page!.default());

    expect(html).toContain("Sign in with GitHub");
    expect(html).not.toContain("Create draft");
  });
});
