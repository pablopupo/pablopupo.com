import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const entryId = "00000000-0000-4000-8000-000000000001";

describe("public comments", () => {
  it("renders visitor text as text and an owner reply through safe Markdown", async () => {
    const module = await import("./comments").catch(() => undefined);
    expect(module?.Comments).toBeTypeOf("function");
    if (!module) throw new Error("Comments module is unavailable");
    const Comments = module.Comments;
    const html = renderToStaticMarkup(
      <Comments
        entryId={entryId}
        initialComments={[
          {
            id: "comment-1",
            authorName: null,
            body: "<script>alert('no')</script>\nLiteral **stars**",
            authorReplyMarkdown: "**Thanks** for reading.",
            authorRepliedAt: "2026-07-22T11:30:00.000Z",
            createdAt: "2026-07-22T11:00:00.000Z",
          },
        ]}
      />
    );

    expect(html).toContain("Anonymous");
    expect(html).toContain("&lt;script&gt;alert(&#x27;no&#x27;)&lt;/script&gt;");
    expect(html).toContain("Literal **stars**");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("<strong>Thanks</strong>");
    expect(html).not.toContain('type="email"');
  });

  it("submits only name, body, and the hidden honeypot", async () => {
    const module = await import("./comments");
    expect(module.submitPublicComment).toBeTypeOf("function");
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(
        { message: "Thanks. Your comment is awaiting moderation." },
        { status: 202 }
      )
    );

    await expect(
      module.submitPublicComment(
        entryId,
        { authorName: "Reader", body: "A response", website: "" },
        fetcher
      )
    ).resolves.toEqual({
      message: "Thanks. Your comment is awaiting moderation.",
    });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/comments?entryId=${entryId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          authorName: "Reader",
          body: "A response",
          website: "",
        }),
      }
    );
  });

  it("preserves text entered after a submission began", async () => {
    const module = await import("./comments");

    expect(module.clearSubmittedValue("New comment", "Sent comment")).toBe(
      "New comment"
    );
    expect(module.clearSubmittedValue("Sent comment", "Sent comment")).toBe(
      ""
    );
  });
});
