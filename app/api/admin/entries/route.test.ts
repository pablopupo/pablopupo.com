import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: {
    list: vi.fn(),
    create: vi.fn(),
    load: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    action: vi.fn(),
    revisions: vi.fn(),
    revision: vi.fn(),
    restoreRevision: vi.fn(),
  },
  withAdminEntryHandlers: vi.fn(),
}));

vi.mock("@/lib/admin/server", () => ({
  withAdminEntryHandlers: mocks.withAdminEntryHandlers,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withAdminEntryHandlers.mockImplementation(
    async (operation: (handlers: typeof mocks.handlers) => Promise<Response>) =>
      operation(mocks.handlers)
  );
  for (const handler of Object.values(mocks.handlers)) {
    handler.mockResolvedValue(new Response(null, { status: 204 }));
  }
});

describe("admin entry route modules", () => {
  it("delegates collection reads and creates", async () => {
    const route = await import("./route");
    const readRequest = new Request("https://example.com/api/admin/entries");
    const createRequest = new Request("https://example.com/api/admin/entries", {
      method: "POST",
    });

    await expect(route.GET(readRequest)).resolves.toHaveProperty("status", 204);
    await expect(route.POST(createRequest)).resolves.toHaveProperty("status", 204);
    expect(mocks.handlers.list).toHaveBeenCalledWith(readRequest);
    expect(mocks.handlers.create).toHaveBeenCalledWith(createRequest);
  });

  it("awaits dynamic parameters and delegates item operations", async () => {
    const route = await import("./[id]/route");
    const context = { params: Promise.resolve({ id: "entry-1" }) };
    const readRequest = new Request("https://example.com/api/admin/entries/entry-1");
    const updateRequest = new Request(
      "https://example.com/api/admin/entries/entry-1",
      { method: "PATCH" }
    );
    const deleteRequest = new Request(
      "https://example.com/api/admin/entries/entry-1",
      { method: "DELETE" }
    );

    await route.GET(readRequest, context);
    await route.PATCH(updateRequest, context);
    await route.DELETE(deleteRequest, context);

    expect(mocks.handlers.load).toHaveBeenCalledWith(readRequest, "entry-1");
    expect(mocks.handlers.update).toHaveBeenCalledWith(updateRequest, "entry-1");
    expect(mocks.handlers.remove).toHaveBeenCalledWith(deleteRequest, "entry-1");
  });

  it("delegates entry actions", async () => {
    const route = await import("./[id]/actions/route");
    const request = new Request(
      "https://example.com/api/admin/entries/entry-1/actions",
      { method: "POST" }
    );

    await route.POST(request, { params: Promise.resolve({ id: "entry-1" }) });

    expect(mocks.handlers.action).toHaveBeenCalledWith(request, "entry-1");
  });

  it("delegates revision history, preview, and restore", async () => {
    const historyRoute = await import("./[id]/revisions/route");
    const revisionRoute = await import(
      "./[id]/revisions/[revisionNumber]/route"
    );
    const restoreRoute = await import(
      "./[id]/revisions/[revisionNumber]/restore/route"
    );
    const historyRequest = new Request(
      "https://example.com/api/admin/entries/entry-1/revisions"
    );
    const previewRequest = new Request(
      "https://example.com/api/admin/entries/entry-1/revisions/2"
    );
    const restoreRequest = new Request(
      "https://example.com/api/admin/entries/entry-1/revisions/2/restore",
      { method: "POST" }
    );
    const entryContext = { params: Promise.resolve({ id: "entry-1" }) };
    const revisionContext = {
      params: Promise.resolve({ id: "entry-1", revisionNumber: "2" }),
    };

    await historyRoute.GET(historyRequest, entryContext);
    await revisionRoute.GET(previewRequest, revisionContext);
    await restoreRoute.POST(restoreRequest, revisionContext);

    expect(mocks.handlers.revisions).toHaveBeenCalledWith(
      historyRequest,
      "entry-1"
    );
    expect(mocks.handlers.revision).toHaveBeenCalledWith(
      previewRequest,
      "entry-1",
      "2"
    );
    expect(mocks.handlers.restoreRevision).toHaveBeenCalledWith(
      restoreRequest,
      "entry-1",
      "2"
    );
  });
});
