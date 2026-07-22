import { beforeEach, describe, expect, it, vi } from "vitest";

const commentId = "00000000-0000-4000-8000-000000000002";
const now = new Date("2026-07-22T12:00:00Z");

function dependencies() {
  return {
    authorize: vi.fn().mockResolvedValue({
      status: "authorized" as const,
      userId: "owner-1",
    }),
    isSameOrigin: vi.fn().mockReturnValue(true),
    now: vi.fn().mockReturnValue(now),
    repository: {
      listComments: vi.fn().mockResolvedValue({
        comments: [{ id: commentId }],
        nextCursor: null,
      }),
      moderateComment: vi.fn().mockResolvedValue({
        id: commentId,
        moderationStatus: "approved",
      }),
      replyToComment: vi.fn().mockResolvedValue({
        id: commentId,
        authorReplyMarkdown: "Thanks.",
      }),
    },
  };
}

describe("owner comment handlers", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["unconfigured", 503],
    ["unauthenticated", 401],
    ["forbidden", 403],
  ] as const)("rejects %s access before listing comments", async (status, code) => {
    const module = await import("./admin-handlers").catch(() => undefined);
    expect(module?.createAdminCommentHandlers).toBeTypeOf("function");
    const options = dependencies();
    options.authorize.mockResolvedValue({ status });
    const handlers = module!.createAdminCommentHandlers(options);

    const response = await handlers.list(
      new Request("https://example.com/api/admin/comments")
    );

    expect(response.status).toBe(code);
    expect(options.repository.listComments).not.toHaveBeenCalled();
  });

  it("lists the pending moderation queue with a bounded default page", async () => {
    const { createAdminCommentHandlers } = await import("./admin-handlers");
    const options = dependencies();
    const handlers = createAdminCommentHandlers(options);
    const request = new Request("https://example.com/api/admin/comments");

    const response = await handlers.list(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      comments: [{ id: commentId }],
      nextCursor: null,
    });
    expect(options.authorize).toHaveBeenCalledWith(request.headers);
    expect(options.repository.listComments).toHaveBeenCalledWith({
      status: "pending",
      limit: 50,
    });
  });

  it("passes status, page size, and a stable cursor to the repository", async () => {
    const { createAdminCommentHandlers } = await import("./admin-handlers");
    const options = dependencies();
    const handlers = createAdminCommentHandlers(options);
    const cursor =
      "2026-07-22T11:00:00.000Z~00000000-0000-4000-8000-000000000002";

    const response = await handlers.list(
      new Request(
        `https://example.com/api/admin/comments?status=spam&limit=25&cursor=${encodeURIComponent(cursor)}`
      )
    );

    expect(response.status).toBe(200);
    expect(options.repository.listComments).toHaveBeenCalledWith({
      status: "spam",
      limit: 25,
      cursor,
    });
  });

  it.each([
    ["status=hidden"],
    ["limit=101"],
    ["limit=0"],
    ["cursor=not-a-cursor"],
  ])("rejects invalid moderation list query %s", async (query) => {
    const { createAdminCommentHandlers } = await import("./admin-handlers");
    const options = dependencies();
    const handlers = createAdminCommentHandlers(options);

    const response = await handlers.list(
      new Request(`https://example.com/api/admin/comments?${query}`)
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "validation failed" });
    expect(options.repository.listComments).not.toHaveBeenCalled();
  });

  it("checks owner access and same origin before reading a mutation body", async () => {
    const { createAdminCommentHandlers } = await import("./admin-handlers");
    const options = dependencies();
    options.isSameOrigin.mockReturnValue(false);
    const handlers = createAdminCommentHandlers(options);
    const request = new Request(
      `https://example.com/api/admin/comments/${commentId}`,
      {
        method: "PATCH",
        body: "not-json",
      }
    );

    const response = await handlers.update(request, commentId);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "same-origin request required",
    });
    expect(options.repository.moderateComment).not.toHaveBeenCalled();
    expect(options.repository.replyToComment).not.toHaveBeenCalled();
  });

  it("moderates a comment through the trusted owner-only action", async () => {
    const { createAdminCommentHandlers } = await import("./admin-handlers");
    const options = dependencies();
    const handlers = createAdminCommentHandlers(options);
    const request = new Request(
      `https://example.com/api/admin/comments/${commentId}`,
      {
        method: "PATCH",
        headers: {
          origin: "https://example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "moderate",
          moderationStatus: "approved",
        }),
      }
    );

    const response = await handlers.update(request, commentId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      comment: { id: commentId, moderationStatus: "approved" },
    });
    expect(options.repository.moderateComment).toHaveBeenCalledWith(
      commentId,
      "approved",
      now
    );
    expect(options.repository.replyToComment).not.toHaveBeenCalled();
  });

  it("sets an owner Markdown reply without changing public comment text", async () => {
    const { createAdminCommentHandlers } = await import("./admin-handlers");
    const options = dependencies();
    const handlers = createAdminCommentHandlers(options);
    const request = new Request(
      `https://example.com/api/admin/comments/${commentId}`,
      {
        method: "PATCH",
        headers: {
          origin: "https://example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "reply",
          authorReplyMarkdown: "**Thanks** for the question.",
        }),
      }
    );
    options.repository.replyToComment.mockResolvedValue({
      id: commentId,
      body: "Original question",
      authorReplyMarkdown: "**Thanks** for the question.",
    });

    const response = await handlers.update(request, commentId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      comment: {
        id: commentId,
        body: "Original question",
        authorReplyMarkdown: "**Thanks** for the question.",
      },
    });
    expect(options.repository.replyToComment).toHaveBeenCalledWith(
      commentId,
      "**Thanks** for the question.",
      now
    );
    expect(options.repository.moderateComment).not.toHaveBeenCalled();
  });
});
