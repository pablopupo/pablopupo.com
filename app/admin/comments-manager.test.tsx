import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const commentId = "00000000-0000-4000-8000-000000000002";

describe("comments admin", () => {
  it("shows entry context, moderation controls, and owner reply editing", async () => {
    const module = await import("./comments-manager").catch(() => undefined);
    expect(module?.CommentsManager).toBeTypeOf("function");
    if (!module) throw new Error("Comments manager is unavailable");
    const html = renderToStaticMarkup(
      <module.CommentsManager
        initialComments={[
          {
            id: commentId,
            entryId: "00000000-0000-4000-8000-000000000001",
            entrySlug: "piano-note",
            entryTitle: "A piano note",
            entrySection: "music",
            authorName: null,
            body: "Question from a reader",
            moderationStatus: "pending",
            authorReplyMarkdown: null,
            authorRepliedAt: null,
            moderatedAt: null,
            createdAt: "2026-07-22T11:00:00.000Z",
            updatedAt: "2026-07-22T11:00:00.000Z",
          },
        ]}
      />
    );

    expect(html).toContain('href="/music/piano-note"');
    expect(html).toContain("Question from a reader");
    expect(html).toContain("Anonymous");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect(html).toContain("Mark spam");
    expect(html).toContain("Save reply");
    expect(html).toContain("Filter comments");
    expect(html).toContain("Pending");
    expect(html).toContain("Approved");
    expect(html).toContain("Rejected");
    expect(html).toContain("Spam");
  });

  it("loads bounded filtered pages and exposes the next page", async () => {
    const module = await import("./comments-manager");
    const cursor =
      "2026-07-22T11:00:00.000Z~00000000-0000-4000-8000-000000000002";
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        comments: [],
        nextCursor: cursor,
      })
    );

    await expect(
      module.loadAdminComments(
        { status: "approved", cursor, limit: 50 },
        fetcher
      )
    ).resolves.toEqual({ comments: [], nextCursor: cursor });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/admin/comments?status=approved&limit=50&cursor=${encodeURIComponent(cursor)}`,
      { cache: "no-store" }
    );

    const html = renderToStaticMarkup(
      <module.CommentsManager
        initialComments={[]}
        initialNextCursor={cursor}
      />
    );
    expect(html).toContain("Load more");
  });

  it("tracks parallel comment operations independently", async () => {
    const module = await import("./comments-manager");
    const first = module.addBusyComment(new Set<string>(), "comment-1");
    const parallel = module.addBusyComment(first, "comment-2");
    const afterFirstCompletes = module.removeBusyComment(
      parallel,
      "comment-1"
    );

    expect(afterFirstCompletes.has("comment-1")).toBe(false);
    expect(afterFirstCompletes.has("comment-2")).toBe(true);
  });

  it("does not overwrite a reply edited after its save began", async () => {
    const module = await import("./comments-manager");

    expect(
      module.reconcileSavedReply("New draft", "Submitted draft", "Saved reply")
    ).toBe("New draft");
    expect(
      module.reconcileSavedReply(
        "Submitted draft",
        "Submitted draft",
        "Saved reply"
      )
    ).toBe("Saved reply");
  });

  it("keeps unsaved reply drafts when a filter page loads", async () => {
    const module = await import("./comments-manager");

    expect(
      module.mergeLoadedReplies(
        { "comment-1": "Unsaved draft" },
        { "comment-1": "Stored reply", "comment-2": "Another reply" }
      )
    ).toEqual({
      "comment-1": "Unsaved draft",
      "comment-2": "Another reply",
    });
  });

  it("keeps the status filter fixed while a comment mutation is running", async () => {
    const module = await import("./comments-manager");

    expect(
      module.isCommentFilterDisabled(false, false, new Set(["comment-1"]))
    ).toBe(true);
    expect(module.isCommentFilterDisabled(false, false, new Set())).toBe(false);
  });

  it("sends owner moderation and reply actions to one protected endpoint", async () => {
    const module = await import("./comments-manager");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ comment: { id: commentId, moderationStatus: "approved" } })
      )
      .mockResolvedValueOnce(
        Response.json({ comment: { id: commentId, authorReplyMarkdown: "Thanks." } })
      );

    await module.moderateAdminComment(commentId, "approved", fetcher);
    await module.saveAdminReply(commentId, "Thanks.", fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(1, `/api/admin/comments/${commentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "moderate", moderationStatus: "approved" }),
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, `/api/admin/comments/${commentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reply", authorReplyMarkdown: "Thanks." }),
    });
  });
});
