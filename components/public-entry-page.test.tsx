import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicEntry } from "@/lib/public-content";

vi.mock("./comments", () => ({
  default: ({ entryId }: { entryId: string }) => (
    <aside data-comments-entry={entryId}>Comments</aside>
  ),
}));

vi.mock("./markdown-content", () => ({
  default: ({
    markdown,
    anchorHeadings,
  }: {
    markdown: string;
    anchorHeadings?: boolean;
  }) => <div data-anchored={anchorHeadings ? "true" : "false"}>{markdown}</div>,
}));

vi.mock("./view-transition", () => ({
  NamedViewTransition: ({
    name,
    children,
  }: {
    name: string;
    children: React.ReactNode;
  }) => <span data-transition-name={name}>{children}</span>,
}));

const entry: PublicEntry = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "retrieval-notes",
  kind: "note",
  section: "writing",
  tags: ["AI"],
  title: "Retrieval notes",
  summary: "What I learned.",
  bodyMarkdown: "Body",
  publishedAt: "2026-07-22T12:00:00.000Z",
  readMinutes: 3,
  performance: null,
};

describe("public entry page", () => {
  it("anchors the primary body and shows progress only for longer entries", async () => {
    const { PublicEntryPage } = await import("./public-entry-page");

    const shortHtml = renderToStaticMarkup(<PublicEntryPage entry={entry} />);
    const longHtml = renderToStaticMarkup(
      <PublicEntryPage entry={{ ...entry, readMinutes: 6 }} />
    );

    expect(shortHtml).toContain('id="entry-content"');
    expect(shortHtml).toContain('data-anchored="true"');
    expect(shortHtml).toContain(
      'data-transition-name="entry-writing-retrieval-notes"'
    );
    expect(shortHtml).toContain('href="/writing"');
    expect(shortHtml).not.toContain('class="reading-progress"');
    expect(longHtml).toContain('class="reading-progress"');
    expect(longHtml).toContain('data-reading-target="entry-content"');
  });

  it("places same-section neighbors between the body and comments", async () => {
    const { PublicEntryPage } = await import("./public-entry-page");
    const older = {
      ...entry,
      slug: "older-note",
      title: "Older note",
      publishedAt: "2026-07-20T12:00:00.000Z",
    };
    const newer = {
      ...entry,
      slug: "newer-note",
      title: "Newer note",
      publishedAt: "2026-07-24T12:00:00.000Z",
    };

    const html = renderToStaticMarkup(
      <PublicEntryPage entry={entry} older={older} newer={newer} />
    );

    expect(html).toContain('aria-label="More writing"');
    expect(html).toContain('href="/writing/older-note"');
    expect(html).toContain("Older note");
    expect(html).toContain('href="/writing/newer-note"');
    expect(html).toContain("Newer note");
    expect(html.indexOf('id="entry-content"')).toBeLessThan(
      html.indexOf('class="entry-neighbors"')
    );
    expect(html.indexOf('class="entry-neighbors"')).toBeLessThan(
      html.indexOf("data-comments-entry")
    );
  });

  it("renders comments for database-backed entries", async () => {
    const { PublicEntryPage } = await import("./public-entry-page");

    const html = renderToStaticMarkup(<PublicEntryPage entry={entry} />);

    expect(html).toContain(
      'data-comments-entry="00000000-0000-4000-8000-000000000001"'
    );
  });

  it("does not offer comments for legacy entries without a database id", async () => {
    const { PublicEntryPage } = await import("./public-entry-page");

    const html = renderToStaticMarkup(
      <PublicEntryPage entry={{ ...entry, id: null }} />
    );

    expect(html).not.toContain("data-comments-entry");
  });

  it("keeps article progress while removing preview navigation, comments, and publication claims", async () => {
    const { PublicEntryPage } = await import("./public-entry-page");
    const older = {
      ...entry,
      slug: "older-note",
      title: "Older note",
    };

    const html = renderToStaticMarkup(
      <PublicEntryPage
        entry={{ ...entry, readMinutes: 8 }}
        older={older}
        preview
      />
    );

    expect(html).toContain("Retrieval notes");
    expect(html).toContain("Body");
    expect(html).toContain('id="entry-content"');
    expect(html).toContain('class="reading-progress"');
    expect(html).toContain("Saved preview");
    expect(html).not.toContain("<time");
    expect(html).not.toContain('class="entry-neighbors"');
    expect(html).not.toContain("data-comments-entry");
  });
});
