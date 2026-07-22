import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicEntry } from "@/lib/public-content";

vi.mock("./comments", () => ({
  default: ({ entryId }: { entryId: string }) => (
    <aside data-comments-entry={entryId}>Comments</aside>
  ),
}));

vi.mock("./markdown-content", () => ({
  default: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
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

describe("public entry page comments", () => {
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
});
