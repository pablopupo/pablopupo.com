import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WorkEditor, {
  applyProjectPublicationAction,
  parseTechnologyInput,
  persistProject,
  projectSaveMessage,
  reconcileSavedProject,
  type EditorProject,
} from "./work-editor";

const project: EditorProject = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "runtime-lab",
  kind: "project",
  status: "draft",
  title: "Runtime lab",
  organization: "Independent",
  summary: "Experiments in model serving.",
  bodyMarkdown: "## Notes",
  startedOn: "2026-07-01",
  endedOn: "",
  publishedAt: null,
  sortOrder: 2,
  featured: true,
  technologies: ["Python", "CUDA"],
  links: [
    {
      kind: "repository",
      label: "Source",
      url: "https://github.com/pablopupo/runtime-lab",
      sortOrder: 0,
    },
  ],
  updatedAt: "2026-07-22T12:00:00.000Z",
};

function successResponse(savedProject: EditorProject) {
  return new Response(JSON.stringify({ project: savedProject }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Work editor payloads", () => {
  it("keeps comma-separated technology input editable and normalized", () => {
    expect(parseTechnologyInput(" Python, CUDA, , Postgres ")).toEqual([
      "Python",
      "CUDA",
      "Postgres",
    ]);
  });

  it("forces new projects to start as drafts", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          project: { ...project, id: "new-id", status: "draft" },
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      persistProject(
        {
          ...project,
          id: null,
          status: "published",
          publishedAt: "2026-07-22T12:00:00.000Z",
          updatedAt: null,
        },
        "Python, CUDA",
        "Latest body",
        fetcher
      )
    ).resolves.toMatchObject({ status: "saved" });

    const [, init] = fetcher.mock.calls[0]!;
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/projects",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      status: "draft",
      publishedAt: null,
      bodyMarkdown: "Latest body",
      technologies: ["Python", "CUDA"],
    });
  });

  it("sends updatedAt as the optimistic token for edits", async () => {
    const saved = {
      ...project,
      title: "Runtime systems lab",
      updatedAt: "2026-07-22T13:00:00.000Z",
    };
    const fetcher = vi.fn().mockResolvedValue(successResponse(saved));

    await expect(
      persistProject(
        { ...project, title: "Runtime systems lab" },
        "Python, CUDA",
        "Latest body",
        fetcher
      )
    ).resolves.toEqual({ status: "saved", project: saved });

    const [, init] = fetcher.mock.calls[0]!;
    expect(fetcher).toHaveBeenCalledWith(
      `/api/admin/projects/${project.id}`,
      expect.objectContaining({ method: "PATCH" })
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      expectedUpdatedAt: project.updatedAt,
      project: {
        title: "Runtime systems lab",
        bodyMarkdown: "Latest body",
      },
    });
  });

  it("keeps an optimistic conflict distinct from a generic save error", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "project changed in another session" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(
      persistProject(project, "Python, CUDA", project.bodyMarkdown, fetcher)
    ).resolves.toEqual({
      status: "conflict",
      message: "project changed in another session",
    });
  });

  it("surfaces the first actionable validation issue", () => {
    expect(
      projectSaveMessage(
        {
          error: "validation failed",
          issues: {
            formErrors: [],
            fieldErrors: {
              project: ["End date cannot precede start date"],
            },
          },
        },
        422
      )
    ).toBe("End date cannot precede start date");
  });

  it("keeps newer local edits after a save response", () => {
    const local = {
      ...project,
      title: "Typed while saving",
      bodyMarkdown: "Newer local body",
      technologies: ["Python", "CUDA", "Postgres"],
    };
    const saved = {
      ...project,
      status: "published" as const,
      publishedAt: "2026-07-22T13:00:00.000Z",
      updatedAt: "2026-07-22T13:00:00.000Z",
    };

    expect(reconcileSavedProject(local, saved, true)).toEqual({
      ...local,
      id: saved.id,
      status: saved.status,
      publishedAt: saved.publishedAt,
      updatedAt: saved.updatedAt,
    });
    expect(reconcileSavedProject(local, saved, false)).toEqual(saved);
  });

  it("builds explicit publish, schedule, unpublish, and archive states", () => {
    const now = new Date("2026-07-22T14:00:00Z");

    expect(
      applyProjectPublicationAction(project, "publish", "", now)
    ).toMatchObject({
      project: { status: "published", publishedAt: now.toISOString() },
    });
    expect(
      applyProjectPublicationAction(
        project,
        "schedule",
        "2030-08-01T12:30",
        now
      )
    ).toMatchObject({
      project: {
        status: "scheduled",
        publishedAt: new Date("2030-08-01T12:30").toISOString(),
      },
    });
    expect(
      applyProjectPublicationAction(project, "schedule", "", now)
    ).toEqual({ error: "Choose a schedule time" });
    expect(
      applyProjectPublicationAction(project, "unpublish", "", now)
    ).toMatchObject({ project: { status: "draft", publishedAt: null } });
    expect(
      applyProjectPublicationAction(project, "archive", "", now)
    ).toMatchObject({ project: { status: "archived" } });
  });
});

describe("Work editor UI", () => {
  it("renders the complete project workflow", () => {
    const html = renderToStaticMarkup(<WorkEditor />);

    for (const label of [
      "Work",
      "New project",
      "Title",
      "Slug",
      "Summary",
      "Body",
      "Status",
      "Publication time",
      "Sort order",
      "Featured",
      "Technologies",
      "Project links",
      "Add link",
      "Create draft",
      "Publish now",
      "Schedule",
      "Unpublish",
      "Archive",
      "Delete",
      "Rich Markdown",
      "Raw Markdown",
    ]) {
      expect(html).toContain(label);
    }
  });
});
