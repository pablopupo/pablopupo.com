import { describe, expect, it } from "vitest";
import { publicCommentSubmissionSchema } from "./validation";

const entryId = "00000000-0000-4000-8000-000000000001";

describe("public comment validation", () => {
  it("trims text and treats a blank optional name as anonymous", () => {
    expect(
      publicCommentSubmissionSchema.parse({
        entryId,
        authorName: "   ",
        body: "  A comment with **literal Markdown**.  ",
      })
    ).toEqual({
      entryId,
      authorName: undefined,
      body: "A comment with **literal Markdown**.",
      website: "",
    });
  });

  it("enforces exact name and body bounds without accepting an email field", () => {
    expect(
      publicCommentSubmissionSchema.safeParse({
        entryId,
        authorName: "x".repeat(80),
        body: "x".repeat(4000),
      }).success
    ).toBe(true);
    expect(
      publicCommentSubmissionSchema.safeParse({
        entryId,
        authorName: "x".repeat(81),
        body: "Comment",
      }).success
    ).toBe(false);
    expect(
      publicCommentSubmissionSchema.safeParse({
        entryId,
        body: "x".repeat(4001),
      }).success
    ).toBe(false);
    expect(
      publicCommentSubmissionSchema.safeParse({
        entryId,
        body: "Comment",
        email: "reader@example.com",
      }).success
    ).toBe(false);
  });

  it("allows line breaks but rejects non-text control characters", () => {
    expect(
      publicCommentSubmissionSchema.safeParse({
        entryId,
        body: "First paragraph.\n\nSecond paragraph.",
      }).success
    ).toBe(true);
    expect(
      publicCommentSubmissionSchema.safeParse({
        entryId,
        body: "Hidden\u0000control",
      }).success
    ).toBe(false);
    expect(
      publicCommentSubmissionSchema.safeParse({
        entryId,
        authorName: "Two\nLines",
        body: "Comment",
      }).success
    ).toBe(false);
  });
});
