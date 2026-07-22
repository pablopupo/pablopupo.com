import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_PROFILE } from "./public-profile";
import { createRssFeed } from "./feed";

const entries = [
  {
    slug: "chopin-<etude>",
    section: "music" as const,
    tags: ["Chopin & piano", "performance"],
    title: "Chopin <Etude> & voicing",
    summary: "A practice note about <voicing> & balance.",
    bodyMarkdown: "Body",
    publishedAt: "2026-07-21T15:00:00.000Z",
  },
  {
    slug: "retrieval-notes",
    section: "writing" as const,
    tags: ["applied AI"],
    title: "Retrieval notes",
    summary: null,
    bodyMarkdown: "## Measure retrieval\n[Ground every answer](https://example.com).",
    publishedAt: "2026-07-20T12:00:00.000Z",
  },
];

describe("RSS feed", () => {
  it("publishes correct channel metadata and every public section", () => {
    const xml = createRssFeed(entries, DEFAULT_PUBLIC_PROFILE);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">'
    );
    expect(xml).toContain("<title>Pablo Pupo · Writing &amp; Music</title>");
    expect(xml).toContain("<link>https://pablopupo.com</link>");
    expect(xml).toContain("<language>en-US</language>");
    expect(xml).toContain(
      '<atom:link href="https://pablopupo.com/rss.xml" rel="self" type="application/rss+xml"/>'
    );
    expect(xml).toContain(
      `<lastBuildDate>${new Date(entries[0]!.publishedAt).toUTCString()}</lastBuildDate>`
    );
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain("https://pablopupo.com/music/chopin-%3Cetude%3E");
    expect(xml).toContain("https://pablopupo.com/writing/retrieval-notes");
  });

  it("escapes XML fields and emits useful item metadata", () => {
    const xml = createRssFeed(entries, DEFAULT_PUBLIC_PROFILE);

    expect(xml).toContain("<title>Chopin &lt;Etude&gt; &amp; voicing</title>");
    expect(xml).toContain(
      "<description>A practice note about &lt;voicing&gt; &amp; balance.</description>"
    );
    expect(xml).toContain("<category>Music</category>");
    expect(xml).toContain("<category>Chopin &amp; piano</category>");
    expect(xml).toContain('<guid isPermaLink="true">');
    expect(xml).toContain("<description>Measure retrieval Ground every answer.</description>");
  });

  it("sorts newest first without mutating the source array", () => {
    const source = [...entries].reverse();

    const xml = createRssFeed(source, DEFAULT_PUBLIC_PROFILE);

    expect(source[0]?.slug).toBe("retrieval-notes");
    expect(xml.indexOf("Chopin &lt;Etude&gt;")).toBeLessThan(
      xml.indexOf("Retrieval notes")
    );
  });
});
