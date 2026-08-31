import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MarkdownContent from "./markdown-content";

describe("MarkdownContent", () => {
  it("renders technical prose without executing HTML", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        markdown={`## Finding

This is **important**, includes \`inline()\`, and links to [the work](/work).

- first
- second

> Verify the boundary.

\`\`\`ts
const answer = 42;
\`\`\`

<script>alert("unsafe")</script>`}
      />
    );

    expect(html).toContain("<h2>Finding</h2>");
    expect(html).toContain("<strong>important</strong>");
    expect(html).toContain("<code>inline()</code>");
    expect(html).toContain('href="/work"');
    expect(html).toContain("<ul>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain('class="language-ts"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps headings unanchored by default", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent markdown="## Scope discipline" />
    );

    expect(html).toContain("<h2>Scope discipline</h2>");
    expect(html).not.toContain('id="scope-discipline"');
    expect(html).not.toContain('class="heading-anchor"');
  });

  it("adds a keyboard-accessible permalink when heading anchors are enabled", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent markdown="## Scope discipline" anchorHeadings />
    );

    expect(html).toContain('<h2 id="scope-discipline">');
    expect(html).toContain('class="heading-anchor"');
    expect(html).toContain('href="#scope-discipline"');
    expect(html).toContain('aria-label="Permalink to Scope discipline"');
    expect(html).toContain(">#</a>");
  });

  it("deduplicates normalized heading slugs within one document", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        markdown={"## Scope discipline\n\n## Scope discipline!"}
        anchorHeadings
      />
    );

    expect(html).toContain('<h2 id="scope-discipline">');
    expect(html).toContain('<h2 id="scope-discipline-2">');
  });

  it("uses visible inline formatting in heading slugs", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        markdown={"## *Tool* `calls` and **schemas**"}
        anchorHeadings
      />
    );

    expect(html).toContain('<h2 id="tool-calls-and-schemas">');
    expect(html).toContain("<em>Tool</em>");
    expect(html).toContain("<code>calls</code>");
    expect(html).toContain("<strong>schemas</strong>");
  });

  it("renders wikilinks, safe images, and YouTube directives", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        markdown={`Read [[Tool Calls|my note]].

![Pablo at a piano](/media/piano.webp)

::youtube{id="dQw4w9WgXcQ" title="Piano performance"}`}
      />
    );

    expect(html).toContain('href="/writing/tool-calls"');
    expect(html).toContain('src="/media/piano.webp"');
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'
    );
    expect(html).toContain('title="Piano performance"');
  });

  it("resolves safe reference links and images", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        markdown={`Read [the notes][notes].

![Pablo performing][portrait]

[notes]: https://example.com/notes "Notes"
[portrait]: /media/performance.webp`}
      />
    );

    expect(html).toContain('href="https://example.com/notes"');
    expect(html).toContain('title="Notes"');
    expect(html).toContain('src="/media/performance.webp"');
    expect(html).toContain('alt="Pablo performing"');
  });

  it("keeps escaped wikilinks literal", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        markdown={String.raw`Keep \[\[literal]] but link [[Real Note]].`}
      />
    );

    expect(html).toContain("Keep [[literal]]");
    expect(html).not.toContain('href="/writing/literal"');
    expect(html).toContain('href="/writing/real-note"');
  });

  it("drops unsafe link and image targets", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        markdown={`[unsafe](javascript:alert(1))

![unsafe](data:text/html,unsafe)`}
      />
    );

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("<img");
    expect(html).toContain("unsafe");
  });

  it("drops unsafe reference targets", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        markdown={`[unsafe][link]

![unsafe][image]

[link]: javascript:alert(1)
[image]: data:text/html,unsafe`}
      />
    );

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("<img");
    expect(html).toContain("unsafe");
  });

  it("does not create embeds for malformed directives", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent markdown={'::youtube{id="short" title="Invalid"}'} />
    );

    expect(html).not.toContain("<iframe");
  });

  it("accepts a presentation class without replacing its base class", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent markdown="Profile copy." className="profile-copy" />
    );

    expect(html).toContain('class="markdown-content profile-copy"');
  });
});
