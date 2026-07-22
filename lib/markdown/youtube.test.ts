import { describe, expect, it } from "vitest";
import {
  analyzeAuthoringMarkdown,
  restoreAuthoringSyntax,
  shouldPublishMarkdownUpdate,
  youtubeRenderModel,
} from "./youtube";

describe("authoring Markdown", () => {
  it("round-trips portable Markdown and a constrained YouTube leaf directive", () => {
    const source = `# Heading

Paragraph with *emphasis*, [a link](https://example.com), and [[a wikilink]].

- first
- second

> quoted

\`\`\`ts
const answer = 42
\`\`\`

![Score](https://example.com/score.webp)

<kbd>raw HTML stays Markdown</kbd>

::youtube{id="M7lc1UVf-VE" title="Milkdown demo"}
`;

    const analysis = analyzeAuthoringMarkdown(source);

    expect(analysis.issues).toEqual([]);
    expect(analysis.youtube).toEqual([
      { id: "M7lc1UVf-VE", title: "Milkdown demo" },
    ]);
    for (const semanticFragment of [
      "# Heading",
      "*emphasis*",
      "[a link](https://example.com)",
      "[[a wikilink]]",
      "- first",
      "> quoted",
      "```ts",
      "![Score](https://example.com/score.webp)",
      "<kbd>raw HTML stays Markdown</kbd>",
      '::youtube{id="M7lc1UVf-VE" title="Milkdown demo"}',
    ]) {
      expect(analysis.canonicalMarkdown).toContain(semanticFragment);
    }
    expect(youtubeRenderModel(analysis.youtube[0]!)).toEqual({
      id: "M7lc1UVf-VE",
      title: "Milkdown demo",
      embedUrl: "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE",
    });
  });

  it.each([
    ['::youtube{id="too-short"}', "11-character video ID"],
    [
      '::youtube{id="M7lc1UVf-VE" src="https://evil.example/embed"}',
      "only id and title",
    ],
    [
      ':::youtube{id="M7lc1UVf-VE"}\ncontent\n:::',
      "must be a leaf directive",
    ],
    [
      '::youtube[caption]{id="M7lc1UVf-VE"}',
      "cannot contain caption text",
    ],
    [
      '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>',
      "iframe HTML is not allowed",
    ],
    [
      "![Temporary](blob:https://example.com/id)",
      "image URLs must use HTTP(S) or a site-relative path",
    ],
  ])("rejects unsafe authoring Markdown: %s", (source, expectedIssue) => {
    expect(
      analyzeAuthoringMarkdown(source).issues.some((issue) =>
        issue.includes(expectedIssue)
      )
    ).toBe(true);
  });

  it.each([
    ["https://example.com/image.webp", true],
    ["http://example.com/image.webp", true],
    ["/images/score.webp", true],
    ["javascript:alert(1)", false],
    ["data:image/svg+xml;base64,PHN2Zz4=", false],
    ["blob:https://example.com/id", false],
    ["https://user:secret@example.com/image.webp", false],
  ])("validates Markdown image URL %s", (url, accepted) => {
    const issues = analyzeAuthoringMarkdown(`![Image](${url})`).issues;

    expect(issues.length === 0).toBe(accepted);
  });

  it("does not interpret a directive example inside fenced code", () => {
    const analysis = analyzeAuthoringMarkdown(
      '```md\n::youtube{id="not-a-video"}\n```'
    );

    expect(analysis.issues).toEqual([]);
    expect(analysis.youtube).toEqual([]);
  });

  it("preserves authoring-like syntax inside fenced and inline code", () => {
    const source = `\`\`\`md
Literal \\[\\[ stays escaped
::youtube{#M7lc1UVf-VE}
\`\`\`

Inline \`\\[\\[ stays escaped\` and \`::youtube{#M7lc1UVf-VE}\`.
`;

    const analysis = analyzeAuthoringMarkdown(source);

    expect(analysis.canonicalMarkdown).toContain("Literal \\[\\[ stays escaped");
    expect(analysis.canonicalMarkdown).toContain("::youtube{#M7lc1UVf-VE}");
    expect(analysis.canonicalMarkdown).toContain("`\\[\\[ stays escaped`");
    expect(analysis.canonicalMarkdown).toContain(
      "`::youtube{#M7lc1UVf-VE}`"
    );
  });

  it("preserves escaped brackets and unrelated directive text", () => {
    const source = `Literal \\[\\[ is not a wikilink.

Inline text ::youtube{#M7lc1UVf-VE} is not a leaf directive.
`;

    const analysis = analyzeAuthoringMarkdown(source);

    expect(analysis.canonicalMarkdown).toContain(
      "Literal \\[\\[ is not a wikilink."
    );
    expect(analysis.canonicalMarkdown).toContain(
      "Inline text ::youtube{#M7lc1UVf-VE} is not a leaf directive."
    );
  });

  it("preserves authoring-like syntax inside raw HTML", () => {
    const source = `<code>Literal \\[\\[ and ::youtube{#M7lc1UVf-VE}</code>`;

    expect(analyzeAuthoringMarkdown(source).canonicalMarkdown).toContain(source);
  });

  it("canonicalizes ordinary wikilinks and real YouTube leaf directives", () => {
    const source = `Read [[attention is all you need]].

::youtube{id="M7lc1UVf-VE" title="Milkdown demo"}
`;

    const analysis = analyzeAuthoringMarkdown(source);

    expect(analysis.canonicalMarkdown).toContain(
      "[[attention is all you need]]"
    );
    expect(analysis.canonicalMarkdown).toContain(
      '::youtube{id="M7lc1UVf-VE" title="Milkdown demo"}'
    );
  });

  it("restores serialized authoring syntax only in matching AST nodes", () => {
    const serialized = `Read \\[\\[attention is all you need]].

\`\\[\\[inline code]] ::youtube{#M7lc1UVf-VE}\`

\`\`\`md
\\[\\[fenced code]]
::youtube{#M7lc1UVf-VE}
\`\`\`

<code>\\[\\[raw HTML]] ::youtube{#M7lc1UVf-VE}</code>

Inline text ::youtube{#M7lc1UVf-VE} is not a leaf directive.

::youtube{#M7lc1UVf-VE}
`;

    const restored = restoreAuthoringSyntax(serialized);

    expect(restored).toContain("Read [[attention is all you need]].");
    expect(restored).toContain(
      "`\\[\\[inline code]] ::youtube{#M7lc1UVf-VE}`"
    );
    expect(restored).toContain("\\[\\[fenced code]]");
    expect(restored).toContain("::youtube{#M7lc1UVf-VE}\n```");
    expect(restored).toContain(
      "<code>\\[\\[raw HTML]] ::youtube{#M7lc1UVf-VE}</code>"
    );
    expect(restored).toContain(
      "Inline text ::youtube{#M7lc1UVf-VE} is not a leaf directive."
    );
    expect(restored).toContain('::youtube{id="M7lc1UVf-VE"}');
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "blob:https://example.com/id",
  ])("rejects an unsafe reference image URL: %s", (url) => {
    const source = `![Architecture][System Diagram]

[system diagram]: ${url}
`;

    expect(analyzeAuthoringMarkdown(source).issues).toContain(
      "Markdown image URLs must use HTTP(S) or a site-relative path"
    );
  });

  it.each([
    "https://example.com/architecture.webp",
    "http://example.com/architecture.webp",
    "/images/architecture.webp",
  ])("accepts a safe reference image URL: %s", (url) => {
    const source = `![Architecture][System Diagram]

[system diagram]: ${url}
`;

    expect(analyzeAuthoringMarkdown(source).issues).toEqual([]);
  });

  it("does not apply image URL restrictions to link-only definitions", () => {
    const source = `[Email me][Contact]

[contact]: mailto:pablo@example.com
`;

    expect(analyzeAuthoringMarkdown(source).issues).toEqual([]);
  });

  it("suppresses serialized Markdown that is already current", () => {
    expect(shouldPublishMarkdownUpdate("# Same", "# Same")).toBe(false);
    expect(shouldPublishMarkdownUpdate("# Changed", "# Same")).toBe(true);
  });
});
