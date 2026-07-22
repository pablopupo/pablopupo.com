import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchPublicContent: vi.fn(),
}));

vi.mock("@/lib/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/search")>()),
  searchPublicContent: mocks.searchPublicContent,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.searchPublicContent.mockReset();
});

describe("search page", () => {
  it("is always excluded from search engine indexes", async () => {
    const page = await import("./page").catch(() => undefined);

    expect(page?.metadata).toMatchObject({
      title: "Search",
      robots: { index: false, follow: true },
      alternates: {
        canonical: "/search",
        types: { "application/rss+xml": "/rss.xml" },
      },
      openGraph: { url: "/search", title: "Search" },
      twitter: { title: "Search" },
    });
  });

  it("renders a semantic GET search form before a query", async () => {
    mocks.searchPublicContent.mockResolvedValue({
      status: "empty",
      query: "",
      message: null,
      results: [],
    });
    const page = await import("./page").catch(() => undefined);
    expect(page?.default).toBeTypeOf("function");

    const html = renderToStaticMarkup(
      await page!.default({ searchParams: Promise.resolve({}) })
    );

    expect(mocks.searchPublicContent).toHaveBeenCalledWith(undefined);
    expect(html).toContain('<form role="search"');
    expect(html).toContain('action="/search"');
    expect(html).toContain('method="get"');
    expect(html).toContain('name="q"');
    expect(html).toContain('maxLength="80"');
    expect(html).toContain("Search public writing, music, and work.");
    expect(html).toContain('class="public-index reading-shell"');
    expect(html).toContain('class="page-header"');
  });

  it("renders normalized results with public links", async () => {
    mocks.searchPublicContent.mockResolvedValue({
      status: "ready",
      query: "Applied AI",
      message: null,
      results: [
        {
          type: "entry",
          title: "Applied AI retrieval notes",
          summary: "Notes on retrieval quality.",
          href: "/writing/retrieval-notes",
          section: "Writing",
          publishedAt: "2026-07-20T12:00:00.000Z",
        },
      ],
    });
    const page = await import("./page").catch(() => undefined);

    const html = renderToStaticMarkup(
      await page!.default({
        searchParams: Promise.resolve({ q: ["Applied AI", "ignored"] }),
      })
    );

    expect(mocks.searchPublicContent).toHaveBeenCalledWith("Applied AI");
    expect(html).toContain("1 result for “Applied AI”");
    expect(html).toContain('href="/writing/retrieval-notes"');
    expect(html).toContain("Notes on retrieval quality.");
    expect(html).toContain('dateTime="2026-07-20T12:00:00.000Z"');
  });

  it("shows bounded-query validation without presenting results", async () => {
    mocks.searchPublicContent.mockResolvedValue({
      status: "invalid",
      query: "x",
      message: "Search for at least 2 characters.",
      results: [],
    });
    const page = await import("./page").catch(() => undefined);

    const html = renderToStaticMarkup(
      await page!.default({ searchParams: Promise.resolve({ q: "x" }) })
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Search for at least 2 characters.");
    expect(html).not.toContain("No results for");
  });
});
