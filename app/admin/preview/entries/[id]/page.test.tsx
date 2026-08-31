import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAdminRouteState: vi.fn(),
  loadAdminEntryPreview: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/app/admin/admin-route", () => ({
  loadAdminRouteState: mocks.loadAdminRouteState,
}));

vi.mock("@/lib/admin/entry-preview", () => ({
  loadAdminEntryPreview: mocks.loadAdminEntryPreview,
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

const entryId = "11111111-1111-4111-8111-111111111111";
const preview = {
  status: "draft" as const,
  entry: {
    id: entryId,
    slug: "clinical-evaluation-notes",
    kind: "note" as const,
    section: "writing" as const,
    tags: ["evaluation"],
    title: "Clinical evaluation notes",
    summary: "Testing the first workflow.",
    bodyMarkdown: "## Result\n\nThe saved draft body.",
    publishedAt: "2026-08-06T13:30:00.000Z",
    readMinutes: 8,
    performance: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadAdminRouteState.mockResolvedValue({ mode: "authorized" });
  mocks.loadAdminEntryPreview.mockResolvedValue(preview);
});

describe("entry preview page", () => {
  it("authorizes before validating or loading the requested record", async () => {
    mocks.loadAdminRouteState.mockResolvedValue({ mode: "signed-out" });
    const { default: EntryPreviewPage } = await import("./page");

    const html = renderToStaticMarkup(
      await EntryPreviewPage({ params: Promise.resolve({ id: "not-a-uuid" }) })
    );

    expect(html).toContain("Only the configured GitHub owner");
    expect(mocks.loadAdminRouteState).toHaveBeenCalledOnce();
    expect(mocks.loadAdminEntryPreview).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("rejects a malformed owner request before loading entry data", async () => {
    const { default: EntryPreviewPage } = await import("./page");

    await expect(
      EntryPreviewPage({ params: Promise.resolve({ id: "not-a-uuid" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.loadAdminEntryPreview).not.toHaveBeenCalled();
  });

  it("renders a saved draft with the real entry renderer and no public interactions", async () => {
    const { default: EntryPreviewPage } = await import("./page");

    const html = renderToStaticMarkup(
      await EntryPreviewPage({ params: Promise.resolve({ id: entryId }) })
    );

    expect(mocks.loadAdminEntryPreview).toHaveBeenCalledWith(entryId);
    expect(html).toContain("Owner-only preview");
    expect(html).toContain("Draft");
    expect(html).toContain("Clinical evaluation notes");
    expect(html).toContain("The saved draft body.");
    expect(html).toContain("Saved preview");
    expect(html).toContain('href="/admin"');
    expect(html).toContain('class="reading-progress"');
    expect(html).not.toContain('class="entry-neighbors"');
    expect(html).not.toContain('class="comments"');
  });

  it("returns not found when an authorized owner requests a missing record", async () => {
    mocks.loadAdminEntryPreview.mockResolvedValue(undefined);
    const { default: EntryPreviewPage } = await import("./page");

    await expect(
      EntryPreviewPage({ params: Promise.resolve({ id: entryId }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("opts the private preview out of static caching and indexing", async () => {
    const page = await import("./page");

    expect(page.dynamic).toBe("force-dynamic");
    expect(page.revalidate).toBe(0);
    expect(page.metadata).toMatchObject({
      title: "Entry preview",
      robots: { index: false, follow: false },
    });
  });
});
