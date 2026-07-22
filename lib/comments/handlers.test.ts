import { beforeEach, describe, expect, it, vi } from "vitest";

const entryId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-22T12:00:00Z");

function dependencies() {
  return {
    repository: {
      listApprovedComments: vi.fn().mockResolvedValue([]),
      createPendingComment: vi.fn().mockResolvedValue({ id: "comment-1" }),
    },
    isSameOrigin: vi.fn().mockReturnValue(true),
    rateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
    now: vi.fn().mockReturnValue(now),
  };
}

function postRequest(body: Record<string, unknown>, origin = "https://example.com") {
  return new Request(`https://example.com/api/comments?entryId=${entryId}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("public comment submission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a pending plain-text comment and masks honeypot rejection", async () => {
    const module = await import("./handlers").catch(() => undefined);
    expect(module?.createPublicCommentHandlers).toBeTypeOf("function");
    const options = dependencies();
    const handlers = module!.createPublicCommentHandlers(options);

    const accepted = await handlers.create(
      postRequest({ authorName: "  Reader  ", body: "  Helpful note.  " })
    );
    const acceptedPayload = await accepted.json();

    expect(accepted.status).toBe(202);
    expect(acceptedPayload).toEqual({
      message: "Thanks. Your comment is awaiting moderation.",
    });
    expect(options.rateLimit).toHaveBeenCalledWith(expect.any(Request), now);
    expect(options.repository.createPendingComment).toHaveBeenCalledWith(
      {
        entryId,
        authorName: "Reader",
        body: "Helpful note.",
      },
      now
    );

    options.repository.createPendingComment.mockClear();
    const trapped = await handlers.create(
      postRequest({ body: "Spam", website: "https://spam.example" })
    );
    expect(trapped.status).toBe(202);
    expect(await trapped.json()).toEqual(acceptedPayload);
    expect(options.repository.createPendingComment).not.toHaveBeenCalled();
  });

  it("serves only the repository's approved public shape without caching", async () => {
    const { createPublicCommentHandlers } = await import("./handlers");
    const options = dependencies();
    options.repository.listApprovedComments.mockResolvedValue([
      {
        id: "comment-1",
        authorName: null,
        body: "Public text",
        authorReplyMarkdown: "**Owner reply**",
        authorRepliedAt: new Date("2026-07-22T11:30:00Z"),
        createdAt: new Date("2026-07-22T11:00:00Z"),
      },
    ]);
    const handlers = createPublicCommentHandlers(options);

    const response = await handlers.list(
      new Request(`https://example.com/api/comments?entryId=${entryId}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      comments: [
        {
          id: "comment-1",
          authorName: null,
          body: "Public text",
          authorReplyMarkdown: "**Owner reply**",
          authorRepliedAt: "2026-07-22T11:30:00.000Z",
          createdAt: "2026-07-22T11:00:00.000Z",
        },
      ],
    });
    expect(options.repository.listApprovedComments).toHaveBeenCalledWith(
      entryId,
      now
    );

    options.repository.listApprovedComments.mockResolvedValue(undefined);
    const hidden = await handlers.list(
      new Request(`https://example.com/api/comments?entryId=${entryId}`)
    );
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual({
      error: "Comments are unavailable for this entry.",
    });
  });

  it("requires a same-origin JSON request before reading a submission", async () => {
    const { createPublicCommentHandlers } = await import("./handlers");
    const options = dependencies();
    const handlers = createPublicCommentHandlers(options);
    const crossOrigin = postRequest({ body: "No" }, "https://attacker.example");
    options.isSameOrigin.mockReturnValue(false);

    const rejected = await handlers.create(crossOrigin);

    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toEqual({ error: "This request is not allowed." });
    expect(options.rateLimit).not.toHaveBeenCalled();
    expect(options.repository.createPendingComment).not.toHaveBeenCalled();

    options.isSameOrigin.mockReturnValue(true);
    const wrongType = new Request(
      `https://example.com/api/comments?entryId=${entryId}`,
      {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "text/plain" },
        body: JSON.stringify({ body: "Looks like JSON" }),
      }
    );
    const unsupported = await handlers.create(wrongType);
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toEqual({
      error: "The comment format is not supported.",
    });
    expect(options.repository.createPendingComment).not.toHaveBeenCalled();
  });

  it("rejects declared and actual request bodies over 8 KiB before JSON parsing", async () => {
    const { createPublicCommentHandlers } = await import("./handlers");
    const options = dependencies();
    const handlers = createPublicCommentHandlers(options);
    const headers = {
      origin: "https://example.com",
      "content-type": "application/json",
    };
    const declaredTooLarge = new Request(
      `https://example.com/api/comments?entryId=${entryId}`,
      {
        method: "POST",
        headers: { ...headers, "content-length": "8193" },
        body: JSON.stringify({ body: "Small body" }),
      }
    );
    const encodedTooLarge = new Request(
      `https://example.com/api/comments?entryId=${entryId}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ body: "界".repeat(3000) }),
      }
    );

    const declaredResponse = await handlers.create(declaredTooLarge);
    const encodedResponse = await handlers.create(encodedTooLarge);

    expect(declaredResponse.status).toBe(413);
    expect(encodedResponse.status).toBe(413);
    expect(await declaredResponse.json()).toEqual({
      error: "The comment is too large.",
    });
    expect(await encodedResponse.json()).toEqual({
      error: "The comment is too large.",
    });
    expect(options.repository.createPendingComment).not.toHaveBeenCalled();
  });

  it("masks a secondary rate-limit rejection and returns generic validation errors", async () => {
    const { createPublicCommentHandlers } = await import("./handlers");
    const options = dependencies();
    options.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });
    const handlers = createPublicCommentHandlers(options);

    const limited = await handlers.create(postRequest({ body: "Too frequent" }));
    expect(limited.status).toBe(202);
    expect(await limited.json()).toEqual({
      message: "Thanks. Your comment is awaiting moderation.",
    });
    expect(options.repository.createPendingComment).not.toHaveBeenCalled();

    const invalid = await handlers.create(
      postRequest({ body: "Comment", email: "reader@example.com" })
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toEqual({
      error: "Check your name and comment and try again.",
    });
    expect(options.repository.createPendingComment).not.toHaveBeenCalled();
  });

  it("returns 503 without persistence when the global limiter is unavailable", async () => {
    const { createPublicCommentHandlers } = await import("./handlers");
    const options = dependencies();
    options.rateLimit.mockRejectedValue(new Error("database unavailable"));

    const response = await createPublicCommentHandlers(options).create(
      postRequest({ body: "A valid comment" })
    );

    expect(response.status).toBe(503);
    expect(options.repository.createPendingComment).not.toHaveBeenCalled();
  });

  it("does not accept comments for a non-public entry", async () => {
    const { createPublicCommentHandlers } = await import("./handlers");
    const { CommentEntryUnavailableError } = await import("./repository");
    const options = dependencies();
    options.repository.createPendingComment.mockRejectedValue(
      new CommentEntryUnavailableError("Unavailable")
    );
    const handlers = createPublicCommentHandlers(options);

    const response = await handlers.create(postRequest({ body: "Hidden entry" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Comments are unavailable for this entry.",
    });
  });
});
