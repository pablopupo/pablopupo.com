import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  withAdminCommentHandlers: vi.fn(),
}));

vi.mock("@/lib/comments/server", () => ({
  withAdminCommentHandlers: mocks.withAdminCommentHandlers,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue(Response.json({ comments: [] }));
  mocks.withAdminCommentHandlers.mockImplementation(
    (operation: (handlers: { list: typeof mocks.list }) => Promise<Response>) =>
      operation({ list: mocks.list })
  );
});

describe("owner comment API routes", () => {
  it("delegates list and mutation requests with path identity", async () => {
    const route = await import("./route").catch(() => undefined);
    expect(route?.GET).toBeTypeOf("function");
    const listRequest = new Request(
      "https://example.com/api/admin/comments?status=spam&limit=25"
    );
    await route!.GET(listRequest);
    expect(mocks.list).toHaveBeenCalledWith(listRequest);

    const detailMocks = {
      update: vi.fn().mockResolvedValue(Response.json({ comment: {} })),
    };
    mocks.withAdminCommentHandlers.mockImplementationOnce(
      (operation: (handlers: typeof detailMocks) => Promise<Response>) =>
        operation(detailMocks)
    );
    const detail = await import("./[id]/route").catch(() => undefined);
    expect(detail?.PATCH).toBeTypeOf("function");
    const patchRequest = new Request(
      "https://example.com/api/admin/comments/00000000-0000-4000-8000-000000000002",
      { method: "PATCH", body: "{}" }
    );
    await detail!.PATCH(patchRequest, {
      params: Promise.resolve({
        id: "00000000-0000-4000-8000-000000000002",
      }),
    });
    expect(detailMocks.update).toHaveBeenCalledWith(
      patchRequest,
      "00000000-0000-4000-8000-000000000002"
    );
  });
});
