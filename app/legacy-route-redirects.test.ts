import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  redirect.mockReset();
});

describe("legacy work routes", () => {
  it.each([
    ["projects", "/work", () => import("./projects/page")],
    ["contributions", "/work/contributions", () => import("./contributions/page")],
  ])("redirects /%s to its current location", async (_route, destination, loadPage) => {
    const page = await loadPage();

    page.default();

    expect(redirect).toHaveBeenCalledWith(destination);
  });
});
