import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRepository: vi.fn(),
  getDatabase: vi.fn(),
  loadAdminRouteState: vi.fn(),
  loadProjectPreview: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/app/admin/admin-route", () => ({
  loadAdminRouteState: mocks.loadAdminRouteState,
}));

vi.mock("@/app/admin/admin-shell", () => ({
  AdminAccessState: ({ state }: { state: { mode: string } }) => (
    <p>Access: {state.mode}</p>
  ),
}));

vi.mock("@/lib/admin/project-preview", () => ({
  loadProjectPreview: mocks.loadProjectPreview,
}));

vi.mock("@/lib/admin/project-repository", () => ({
  createAdminProjectRepository: mocks.createRepository,
}));

vi.mock("@/lib/db/client", () => ({
  getDatabase: mocks.getDatabase,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("work preview page", () => {
  it("is always dynamic, uncached, and labeled as a preview", async () => {
    const page = await import("./page").catch(() => undefined);

    expect(page?.dynamic).toBe("force-dynamic");
    expect(page?.revalidate).toBe(0);
    expect(page?.metadata).toEqual({
      title: "Work preview",
      robots: { index: false, follow: false },
    });
  });

  it("checks owner access before validating or loading the private project", async () => {
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "signed-out" });
    const page = await import("./page");

    const html = renderToStaticMarkup(
      await page.default({
        params: Promise.resolve({ id: "not-a-project-id" }),
      })
    );

    expect(html).toContain("Access: signed-out");
    expect(mocks.loadProjectPreview).not.toHaveBeenCalled();
    expect(mocks.createRepository).not.toHaveBeenCalled();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("renders an authorized saved draft through the public project renderer", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const database = { source: "test database" };
    const repository = { getProject: vi.fn() };
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "authorized" });
    mocks.getDatabase.mockReturnValue(database);
    mocks.createRepository.mockReturnValue(repository);
    mocks.loadProjectPreview.mockResolvedValue({
      status: "draft",
      project: {
        id,
        slug: "runtime-lab",
        kind: "project",
        title: "Runtime lab",
        organization: "Independent",
        summary: "Experiments in model serving.",
        bodyMarkdown: "## Current draft\n\nPrivate preview body.",
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
        ],
      },
    });
    const page = await import("./page");

    const html = renderToStaticMarkup(
      await page.default({ params: Promise.resolve({ id }) })
    );

    expect(html).toContain("Owner-only preview");
    expect(html).toContain("Draft · Runtime lab");
    expect(html).toContain('href="/admin/work"');
    expect(html).toContain('class="project-list"');
    expect(html).toContain("Runtime lab</h3>");
    expect(html).toContain("Private preview body.");
    expect(html).toContain('href="https://github.com/pablopupo/runtime-lab"');
    expect(mocks.createRepository).toHaveBeenCalledWith(database);
    expect(mocks.loadProjectPreview).toHaveBeenCalledWith(id, repository);
  });

  it("returns the normal not-found boundary for an invalid or missing authorized project", async () => {
    const repository = { getProject: vi.fn() };
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "authorized" });
    mocks.getDatabase.mockReturnValue({});
    mocks.createRepository.mockReturnValue(repository);
    mocks.loadProjectPreview.mockResolvedValue(null);
    const page = await import("./page");

    await expect(
      page.default({ params: Promise.resolve({ id: "missing" }) })
    ).rejects.toThrow("not found");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
