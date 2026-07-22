import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  withPublicCommentHandlers: vi.fn(),
}));

vi.mock("@/lib/comments/server", () => ({
  withPublicCommentHandlers: mocks.withPublicCommentHandlers,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue(Response.json({ comments: [] }));
  mocks.create.mockResolvedValue(Response.json({}, { status: 202 }));
  mocks.withPublicCommentHandlers.mockImplementation(
    (operation: (handlers: { list: typeof mocks.list; create: typeof mocks.create }) => Promise<Response>) =>
      operation({ list: mocks.list, create: mocks.create })
  );
});

describe("public comment API route", () => {
  it("delegates GET and POST with the original request", async () => {
    const route = await import("./route").catch(() => undefined);
    expect(route?.GET).toBeTypeOf("function");
    expect(route?.POST).toBeTypeOf("function");
    const getRequest = new Request("https://example.com/api/comments?entryId=entry");
    const postRequest = new Request("https://example.com/api/comments?entryId=entry", {
      method: "POST",
      body: "{}",
    });

    await route!.GET(getRequest);
    await route!.POST(postRequest);

    expect(mocks.list).toHaveBeenCalledWith(getRequest);
    expect(mocks.create).toHaveBeenCalledWith(postRequest);
  });
});
