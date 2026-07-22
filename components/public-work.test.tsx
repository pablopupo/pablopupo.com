import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectList } from "./public-work";

const project = {
  id: "project-id",
  slug: "safe-links",
  kind: "project" as const,
  title: "Safe project links",
  organization: null,
  summary: "A public project.",
  bodyMarkdown: "Project notes.",
  startedOn: null,
  endedOn: null,
  publishedAt: "2026-07-01T12:00:00.000Z",
  featured: false,
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

describe("public work", () => {
  it("renders safe web links and omits executable URLs", () => {
    const html = renderToStaticMarkup(<ProjectList projects={[project]} />);

    expect(html).toContain('href="https://github.com/pablopupo/example"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Unsafe");
  });

  it("renders project type, organization, and dates", () => {
    const html = renderToStaticMarkup(
      <ProjectList
        projects={[
          {
            id: "00000000-0000-4000-8000-000000000001",
            slug: "ai-residency",
            kind: "experience",
            title: "Applied AI residency",
            organization: "Example AI Lab",
            summary: "Built evaluation tooling.",
            bodyMarkdown: "Details",
            startedOn: "2025-06-01",
            endedOn: null,
            publishedAt: "2026-07-01T12:00:00.000Z",
            featured: true,
            technologies: ["Python"],
            links: [],
          },
        ]}
      />
    );

    expect(html).toContain("Experience");
    expect(html).toContain("Example AI Lab");
    expect(html).toContain("June 2025 to Present");
  });
});
