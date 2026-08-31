import { describe, expect, it, vi } from "vitest";

describe("project preview", () => {
  it("adapts a saved draft to the exact public project shape", async () => {
    const module = await import("./project-preview").catch(() => undefined);

    expect(module?.projectPreview).toBeTypeOf("function");
    expect(
      module!.projectPreview({
        id: "11111111-1111-4111-8111-111111111111",
        slug: "runtime-lab",
        kind: "experience",
        status: "draft",
        title: "Runtime lab",
        organization: "Independent",
        summary: "Experiments in model serving.",
        bodyMarkdown: "## Current draft",
        coverMediaId: null,
        startedOn: "2026-07-01",
        endedOn: null,
        publishedAt: null,
        sortOrder: 2,
        featured: true,
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
        updatedAt: new Date("2026-08-05T15:00:00.000Z"),
        technologies: ["Python", "CUDA"],
        links: [
          {
            kind: "live",
            label: "Demo",
            url: "https://example.com/demo",
            sortOrder: 2,
          },
          {
            kind: "repository",
            label: "Source",
            url: "https://github.com/pablopupo/runtime-lab",
            sortOrder: 1,
          },
        ],
      })
    ).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "runtime-lab",
      kind: "experience",
      title: "Runtime lab",
      organization: "Independent",
      summary: "Experiments in model serving.",
      bodyMarkdown: "## Current draft",
      startedOn: "2026-07-01",
      endedOn: null,
      publishedAt: "2026-08-05T15:00:00.000Z",
      featured: true,
      technologies: ["Python", "CUDA"],
      links: [
        {
          kind: "repository",
          label: "Source",
          url: "https://github.com/pablopupo/runtime-lab",
        },
        {
          kind: "live",
          label: "Demo",
          url: "https://example.com/demo",
        },
      ],
    });
  });

  it("rejects an invalid project ID without querying private records", async () => {
    const module = await import("./project-preview");
    const repository = { getProject: vi.fn() };

    expect(module.loadProjectPreview).toBeTypeOf("function");
    await expect(
      module.loadProjectPreview("not-a-project-id", repository)
    ).resolves.toBeNull();
    expect(repository.getProject).not.toHaveBeenCalled();
  });

  it.each(["draft", "scheduled", "published", "archived"] as const)(
    "loads a saved %s project without public publication filtering",
    async (status) => {
      const module = await import("./project-preview");
      const repository = {
        getProject: vi.fn().mockResolvedValue({
          id: "11111111-1111-4111-8111-111111111111",
          slug: `${status}-lab`,
          kind: "project",
          status,
          title: `${status} lab`,
          organization: null,
          summary: null,
          bodyMarkdown: "Private saved copy",
          coverMediaId: null,
          startedOn: null,
          endedOn: null,
          publishedAt: null,
          sortOrder: 0,
          featured: false,
          createdAt: new Date("2026-07-01T12:00:00.000Z"),
          updatedAt: new Date("2026-08-05T15:00:00.000Z"),
          technologies: [],
          links: [],
        }),
      };

      await expect(
        module.loadProjectPreview(
          "11111111-1111-4111-8111-111111111111",
          repository
        )
      ).resolves.toMatchObject({
        status,
        project: {
          id: "11111111-1111-4111-8111-111111111111",
          title: `${status} lab`,
          bodyMarkdown: "Private saved copy",
        },
      });
      expect(repository.getProject).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111"
      );
    }
  );

  it("returns no preview when the authorized saved record is missing", async () => {
    const module = await import("./project-preview");
    const repository = { getProject: vi.fn().mockResolvedValue(undefined) };

    await expect(
      module.loadProjectPreview(
        "11111111-1111-4111-8111-111111111111",
        repository
      )
    ).resolves.toBeNull();
  });
});
