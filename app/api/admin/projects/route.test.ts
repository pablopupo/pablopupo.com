import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: {
    list: vi.fn(),
    create: vi.fn(),
    load: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  withAdminProjectHandlers: vi.fn(),
}));

vi.mock("@/lib/admin/server", () => ({
  withAdminProjectHandlers: mocks.withAdminProjectHandlers,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withAdminProjectHandlers.mockImplementation(
    async (operation: (handlers: typeof mocks.handlers) => Promise<Response>) =>
      operation(mocks.handlers)
  );
  for (const handler of Object.values(mocks.handlers)) {
    handler.mockResolvedValue(new Response(null, { status: 204 }));
  }
});

describe("admin project route modules", () => {
  it("delegates collection reads and draft creation", async () => {
    const route = await import("./route").catch(() => undefined);
    expect(route).toBeDefined();
    const readRequest = new Request("https://example.com/api/admin/projects");
    const createRequest = new Request("https://example.com/api/admin/projects", {
      method: "POST",
    });

    await expect(route!.GET(readRequest)).resolves.toHaveProperty("status", 204);
    await expect(route!.POST(createRequest)).resolves.toHaveProperty("status", 204);
    expect(mocks.handlers.list).toHaveBeenCalledWith(readRequest);
    expect(mocks.handlers.create).toHaveBeenCalledWith(createRequest);
  });

  it("awaits dynamic parameters and delegates item operations", async () => {
    const route = await import("./[id]/route").catch(() => undefined);
    expect(route).toBeDefined();
    const context = { params: Promise.resolve({ id: "project-1" }) };
    const readRequest = new Request(
      "https://example.com/api/admin/projects/project-1"
    );
    const updateRequest = new Request(
      "https://example.com/api/admin/projects/project-1",
      { method: "PATCH" }
    );
    const deleteRequest = new Request(
      "https://example.com/api/admin/projects/project-1",
      { method: "DELETE" }
    );

    await route!.GET(readRequest, context);
    await route!.PATCH(updateRequest, context);
    await route!.DELETE(deleteRequest, context);

    expect(mocks.handlers.load).toHaveBeenCalledWith(readRequest, "project-1");
    expect(mocks.handlers.update).toHaveBeenCalledWith(
      updateRequest,
      "project-1"
    );
    expect(mocks.handlers.remove).toHaveBeenCalledWith(
      deleteRequest,
      "project-1"
    );
  });
});
