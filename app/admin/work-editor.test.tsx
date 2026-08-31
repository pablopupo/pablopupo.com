// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkEditor, {
  applyProjectPublicationAction,
  parseTechnologyInput,
  persistProject,
  projectSaveMessage,
  reconcileSavedProject,
  type EditorProject,
} from "./work-editor";
import { preparePreviewWindow } from "@/lib/admin/preview-window";

vi.mock("next/dynamic", () => ({
  default: (
    _loader: unknown,
    options: { loading: () => React.ReactNode }
  ) => options.loading,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  root = null;
  container = null;
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

  it("reserves a tab before saving and opens the saved project preview", async () => {
    const module = await import("./work-editor");
    const replace = vi.fn();
    const close = vi.fn();
    const browser = {
      open: vi.fn().mockReturnValue({
        location: { replace },
        close,
        opener: null,
      }),
      location: { assign: vi.fn() },
    };
    let finishSave: ((value: {
      project: EditorProject;
      changedDuringRequest: boolean;
    }) => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<{
          project: EditorProject;
          changedDuringRequest: boolean;
        }>((resolve) => {
          finishSave = resolve;
        })
    );

    expect(module.saveAndPreviewProject).toBeTypeOf("function");
    const result = module.saveAndPreviewProject(
      save,
      () => preparePreviewWindow(browser)
    );

    expect(browser.open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(save).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();

    finishSave?.({ project, changedDuringRequest: false });

    await expect(result).resolves.toBe(true);
    expect(replace).toHaveBeenCalledWith(
      `/admin/preview/work/${project.id}`
    );
    expect(close).not.toHaveBeenCalled();
  });

  it("cancels the preview when newer local edits remain after saving", async () => {
    const module = await import("./work-editor");
    const replace = vi.fn();
    const close = vi.fn();
    const browser = {
      open: vi.fn().mockReturnValue({
        location: { replace },
        close,
        opener: null,
      }),
      location: { assign: vi.fn() },
    };

    await expect(
      module.saveAndPreviewProject(
        async () => ({ project, changedDuringRequest: true }),
        () => preparePreviewWindow(browser)
      )
    ).resolves.toBe(false);

    expect(close).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it("cancels the reserved tab when the save fails", async () => {
    const module = await import("./work-editor");
    const replace = vi.fn();
    const close = vi.fn();
    const browser = {
      open: vi.fn().mockReturnValue({
        location: { replace },
        close,
        opener: null,
      }),
      location: { assign: vi.fn() },
    };

    await expect(
      module.saveAndPreviewProject(
        async () => null,
        () => preparePreviewWindow(browser)
      )
    ).resolves.toBe(false);

    expect(close).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it("cancels the reserved tab when the save rejects unexpectedly", async () => {
    const module = await import("./work-editor");
    const replace = vi.fn();
    const close = vi.fn();
    const browser = {
      open: vi.fn().mockReturnValue({
        location: { replace },
        close,
        opener: null,
      }),
      location: { assign: vi.fn() },
    };

    await expect(
      module.saveAndPreviewProject(
        async () => {
          throw new Error("save exploded");
        },
        () => preparePreviewWindow(browser)
      )
    ).resolves.toBe(false);

    expect(close).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
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
      "Save &amp; Preview",
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

  it("reserves and cancels a preview tab through the editor action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ projects: [] })));
    const close = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue({
      location: { replace: vi.fn() },
      close,
      opener: null,
    } as unknown as Window);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<WorkEditor />);
      await Promise.resolve();
    });
    const previewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save & Preview"
    );

    act(() => previewButton?.click());

    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    await act(async () => {
      await Promise.resolve();
    });
    expect(close).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Title and slug are required");
  });

  it("opens the saved preview without waiting for the project list refresh", async () => {
    let listRequests = 0;
    let finishRefresh: ((response: Response) => void) | undefined;
    const pendingRefresh = new Promise<Response>((resolve) => {
      finishRefresh = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/admin/projects") {
          listRequests += 1;
          return listRequests === 1
            ? Promise.resolve(jsonResponse({ projects: [project] }))
            : pendingRefresh;
        }
        if (
          url === `/api/admin/projects/${project.id}` &&
          init?.method === "PATCH"
        ) {
          return Promise.resolve(jsonResponse({ project }));
        }
        if (url === `/api/admin/projects/${project.id}` && !init?.method) {
          return Promise.resolve(jsonResponse({ project }));
        }
        throw new Error(`Unexpected request: ${url}`);
      })
    );
    const replace = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      location: { replace },
      close: vi.fn(),
      opener: null,
    } as unknown as Window);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<WorkEditor />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const projectButton = [
      ...container.querySelectorAll<HTMLButtonElement>("aside button"),
    ].find((button) => button.textContent?.includes(project.title));
    await act(async () => {
      projectButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const previewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save & Preview"
    );

    await act(async () => {
      previewButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const openedBeforeRefresh = replace.mock.calls.length > 0;
    expect(listRequests).toBe(2);

    await act(async () => {
      finishRefresh?.(jsonResponse({ projects: [project] }));
      await pendingRefresh;
      await Promise.resolve();
    });

    expect(openedBeforeRefresh).toBe(true);
    expect(replace).toHaveBeenCalledWith(`/admin/preview/work/${project.id}`);
  });
});
