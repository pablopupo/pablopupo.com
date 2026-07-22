import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  redirect.mockReset();
});

describe("legacy work routes", () => {
  it.each([
    ["projects", () => import("./projects/page")],
    ["contributions", () => import("./contributions/page")],
  ])("redirects /%s to the combined work page", async (_route, loadPage) => {
    const page = await loadPage();

    page.default();

    expect(redirect).toHaveBeenCalledWith("/work");
  });
});
