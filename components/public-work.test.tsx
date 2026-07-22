import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectList } from "./public-work";

const project = {
  id: "project-id",
  slug: "safe-links",
  title: "Safe project links",
  summary: "A public project.",
  bodyMarkdown: "Project notes.",
  publishedAt: "2026-07-01T12:00:00.000Z",
  technologies: [],
  links: [
    {
      kind: "repository" as const,
      label: "GitHub",
      url: "https://github.com/pablopupo/example",
    },
    {
      kind: "other" as const,
      label: "Unsafe",
      url: "javascript:alert(1)",
    },
  ],
};

describe("public project links", () => {
  it("renders safe web links and omits executable URLs", () => {
    const html = renderToStaticMarkup(<ProjectList projects={[project]} />);

    expect(html).toContain('href="https://github.com/pablopupo/example"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Unsafe");
  });
});
