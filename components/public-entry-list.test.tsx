import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./view-transition", () => ({
  NamedViewTransition: ({
    name,
    children,
  }: {
    name: string;
    children: React.ReactNode;
  }) => <span data-transition-name={name}>{children}</span>,
}));

const entries = [
  {
    slug: "tool-calls",
    kind: "essay" as const,
    section: "writing" as const,
    tags: ["vLLM", "structured outputs"],
    title: "Tool calls and response schemas",
    summary: "What broke, how I reproduced it, and the fix.",
    publishedAt: "2026-07-02T12:00:00.000Z",
    readMinutes: 6,
    performance: null,
  },
];

describe("public entry views", () => {
  it("distinguishes the performance day from the publication date", async () => {
    const { PublicEntryList } = await import("./public-entry-list");
    const performance = { ...entries[0], kind: "performance" as const, performance: { performedAt: "2023-11-30T00:00:00.000Z" } };
    const html = renderToStaticMarkup(<PublicEntryList entries={[performance]} emptyMessage="" />);
    expect(html).toContain("Performed November 30, 2023");
    expect(html).not.toContain("July 2, 2026");
    const unknown = renderToStaticMarkup(<PublicEntryList entries={[{ ...performance, performance: null }]} emptyMessage="" />);
    expect(unknown).toContain("Published July 2, 2026");
  });

  it("renders editorial entry rows with useful metadata", async () => {
    const module = await import("./public-entry-list").catch(() => undefined);
    expect(module?.PublicEntryList).toBeTypeOf("function");
    const PublicEntryList = module!.PublicEntryList;

    const html = renderToStaticMarkup(
      <PublicEntryList entries={entries} emptyMessage="No writing yet." />
    );

    expect(html).toContain('href="/writing/tool-calls"');
    expect(html).toContain("Tool calls and response schemas");
    expect(html).toContain('dateTime="2026-07-02T12:00:00.000Z"');
    expect(html).toContain("July 2, 2026");
    expect(html).toContain("6 min read");
    expect(html).toContain("What broke, how I reproduced it, and the fix.");
    expect(html).toContain("vLLM · structured outputs");

    const titleIndex = html.indexOf("Tool calls and response schemas");
    const dateIndex = html.indexOf("July 2, 2026");
    const summaryIndex = html.indexOf(
      "What broke, how I reproduced it, and the fix."
    );
    const tagsIndex = html.indexOf("vLLM · structured outputs");

    expect(titleIndex).toBeLessThan(dateIndex);
    expect(dateIndex).toBeLessThan(summaryIndex);
    expect(summaryIndex).toBeLessThan(tagsIndex);
    expect(html).toContain('class="entry-title-link"');
    expect(html).toContain(
      'data-transition-name="entry-writing-tool-calls"'
    );
    expect(html).toContain('class="entry-meta entry-meta-primary"');
    expect(html).toContain('class="entry-tags"');
  });

  it("gives an empty collection a useful message", async () => {
    const module = await import("./public-entry-list").catch(() => undefined);
    expect(module?.PublicEntryList).toBeTypeOf("function");
    const PublicEntryList = module!.PublicEntryList;

    const html = renderToStaticMarkup(
      <PublicEntryList entries={[]} emptyMessage="No music posted yet." />
    );

    expect(html).toContain("No music posted yet.");
  });

  it("shows a lightweight preview only for recognized YouTube URLs", async () => {
    const module = await import("./public-entry-list").catch(() => undefined);
    expect(module?.YoutubeEmbed).toBeTypeOf("function");
    const YoutubeEmbed = module!.YoutubeEmbed;

    const html = renderToStaticMarkup(
      <YoutubeEmbed
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        title="Piano performance"
      />
    );
    const invalid = renderToStaticMarkup(
      <YoutubeEmbed url="https://example.com/video" title="Invalid" />
    );

    expect(html).toContain(
      'src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"'
    );
    expect(html).toContain('aria-label="Play Piano performance"');
    expect(html).not.toContain("<iframe");
    expect(invalid).toBe("");
  });

  it.each([
    "not a URL",
    "javascript:alert(1)",
    "https://youtube.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=too-short",
  ])("rejects an unsafe or malformed video URL: %s", async (url) => {
    const { YoutubeEmbed } = await import("./public-entry-list");

    expect(
      renderToStaticMarkup(<YoutubeEmbed url={url} title="Invalid" />)
    ).toBe("");
  });
});
