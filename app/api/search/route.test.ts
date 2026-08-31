import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchPublicContent: vi.fn(),
}));

vi.mock("@/lib/search", () => ({
  searchPublicContent: mocks.searchPublicContent,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.searchPublicContent.mockReset();
});

describe("public search API", () => {
  it("returns the top five matches, the total count, and no-store caching", async () => {
    const results = Array.from({ length: 7 }, (_, index) => ({
      type: "entry" as const,
      title: `Result ${index + 1}`,
      summary: `Summary ${index + 1}`,
      href: `/writing/result-${index + 1}`,
      section: "Writing" as const,
      publishedAt: "2026-07-20T12:00:00.000Z",
    }));
    mocks.searchPublicContent.mockResolvedValue({
      status: "ready",
      query: "applied AI",
      message: null,
      results,
    });
    const route = await import("./route").catch(() => undefined);

    expect(route?.GET).toBeTypeOf("function");
    if (!route?.GET) return;

    const response = await route.GET(
      new Request("https://example.com/api/search?q=applied%20AI")
    );

    expect(mocks.searchPublicContent).toHaveBeenCalledWith("applied AI");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      query: "applied AI",
      total: 7,
      results: results.slice(0, 5),
    });
  });

  it("returns an empty bounded response when the query is missing", async () => {
    mocks.searchPublicContent.mockResolvedValue({
      status: "empty",
      query: "",
      message: null,
      results: [],
    });
    const route = await import("./route").catch(() => undefined);

    expect(route?.GET).toBeTypeOf("function");
    if (!route?.GET) return;

    const response = await route.GET(
      new Request("https://example.com/api/search")
    );

    expect(mocks.searchPublicContent).toHaveBeenCalledWith(undefined);
    await expect(response.json()).resolves.toMatchObject({
      total: 0,
      results: [],
    });
  });
});
