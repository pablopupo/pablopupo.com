import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: {
    list: vi.fn(),
    createConcept: vi.fn(),
    mutate: vi.fn(),
  },
  withAdminGraphHandlers: vi.fn(),
}));

vi.mock("@/lib/admin/server", () => ({
  withAdminGraphHandlers: mocks.withAdminGraphHandlers,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withAdminGraphHandlers.mockImplementation(
    async (operation: (handlers: typeof mocks.handlers) => Promise<Response>) =>
      operation(mocks.handlers)
  );
  for (const handler of Object.values(mocks.handlers)) {
    handler.mockResolvedValue(new Response(null, { status: 204 }));
  }
});

describe("admin graph route", () => {
  it("delegates reads, concept creation, and graph mutations", async () => {
    const route = await import("./route").catch(() => undefined);
    expect(route).toBeDefined();
    const readRequest = new Request("https://example.com/api/admin/graph");
    const createRequest = new Request("https://example.com/api/admin/graph", {
      method: "POST",
    });
    const mutateRequest = new Request("https://example.com/api/admin/graph", {
      method: "PATCH",
    });

    await expect(route!.GET(readRequest)).resolves.toHaveProperty("status", 204);
    await expect(route!.POST(createRequest)).resolves.toHaveProperty("status", 204);
    await expect(route!.PATCH(mutateRequest)).resolves.toHaveProperty("status", 204);
    expect(mocks.handlers.list).toHaveBeenCalledWith(readRequest);
    expect(mocks.handlers.createConcept).toHaveBeenCalledWith(createRequest);
    expect(mocks.handlers.mutate).toHaveBeenCalledWith(mutateRequest);
  });
});
