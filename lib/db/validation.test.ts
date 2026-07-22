import { describe, expect, it } from "vitest";
import {
  commentModerationMutationSchema,
  commentMutationSchema,
  commentReplyMutationSchema,
  entryMutationSchema,
  projectMutationSchema,
} from "./validation";

const note = {
  slug: "small-note",
  kind: "note" as const,
  section: "writing" as const,
  tags: [] as string[],
  status: "draft" as const,
  title: "Small note",
  bodyMarkdown: "Body",
};

const project = {
  slug: "gradus-ad-parnassum",
  kind: "project" as const,
  status: "published" as const,
  title: "Gradus ad Parnassum",
  bodyMarkdown: "RAG over musical notation.",
  publishedAt: new Date("2026-07-01T12:00:00Z"),
  sortOrder: 0,
  technologies: ["TypeScript", "PostgreSQL"],
  links: [
    {
      kind: "repository" as const,
      label: "GitHub",
      url: "https://github.com/pablopupo/gradus-ad-parnassum",
      sortOrder: 0,
    },
  ],
};

describe("entryMutationSchema", () => {
  it("accepts a portable Markdown note", () => {
    expect(entryMutationSchema.parse(note)).toMatchObject(note);
  });

  it("normalizes ordered tags and rejects empty, duplicate, or oversized tags", () => {
    expect(
      entryMutationSchema.parse({
        ...note,
        section: "music",
        tags: [" Music ", "Live performance"],
      })
    ).toMatchObject({ section: "music", tags: ["Music", "Live performance"] });
    for (const tags of [
      ["Music", " music "],
      [""],
      Array.from({ length: 21 }, (_, index) => `tag-${index}`),
      ["x".repeat(51)],
    ]) {
      expect(entryMutationSchema.safeParse({ ...note, tags }).success).toBe(false);
    }
  });

  it("validates constrained embeds and durable Markdown image URLs", () => {
    expect(
      entryMutationSchema.safeParse({
        ...note,
        bodyMarkdown:
          '<kbd>HTML</kbd>\n\n::youtube{id="M7lc1UVf-VE" title="Demo"}\n\n![Score](/images/score.webp)',
      }).success
    ).toBe(true);
    for (const bodyMarkdown of [
      '::youtube{id="too-short"}',
      '::youtube{id="M7lc1UVf-VE" src="https://evil.example/embed"}',
      '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>',
      '![Temporary](blob:https://example.com/id)',
      '![Executable](javascript:alert(1))',
    ]) {
      expect(entryMutationSchema.safeParse({ ...note, bodyMarkdown }).success).toBe(
        false
      );
    }
  });

  it.each(["Uppercase", "two words", "-leading", "trailing-", "has_underscore"])(
    "rejects the non-portable slug %s",
    (slug) => {
      expect(entryMutationSchema.safeParse({ ...note, slug }).success).toBe(false);
    }
  );

  it("requires future publication time for scheduled entries", () => {
    expect(
      entryMutationSchema.safeParse({
        ...note,
        status: "scheduled",
        publishedAt: new Date("2099-01-01T00:00:00Z"),
      }).success
    ).toBe(true);
    expect(
      entryMutationSchema.safeParse({ ...note, status: "scheduled" }).success
    ).toBe(false);
    expect(
      entryMutationSchema.safeParse({
        ...note,
        status: "scheduled",
        publishedAt: new Date("2000-01-01T00:00:00Z"),
      }).success
    ).toBe(false);
  });

  it("requires published entries to have a non-future publication time", () => {
    expect(
      entryMutationSchema.safeParse({
        ...note,
        status: "published",
        publishedAt: new Date("2000-01-01T00:00:00Z"),
      }).success
    ).toBe(true);
    expect(
      entryMutationSchema.safeParse({ ...note, status: "published" }).success
    ).toBe(false);
    expect(
      entryMutationSchema.safeParse({
        ...note,
        status: "published",
        publishedAt: new Date("2099-01-01T00:00:00Z"),
      }).success
    ).toBe(false);
  });

  it("requires YouTube performance metadata only for performance entries", () => {
    const performance = {
      workTitle: "Etude Op. 10 No. 1",
      composer: "Frédéric Chopin",
      youtubeUrl: "https://www.youtube.com/watch?v=example",
    };

    expect(
      entryMutationSchema.safeParse({
        ...note,
        kind: "performance",
        performance,
      }).success
    ).toBe(true);
    expect(
      entryMutationSchema.safeParse({ ...note, kind: "performance" }).success
    ).toBe(false);
    expect(
      entryMutationSchema.safeParse({ ...note, performance }).success
    ).toBe(false);
    expect(
      entryMutationSchema.safeParse({
        ...note,
        kind: "performance",
        performance: { ...performance, youtubeUrl: "https://vimeo.com/example" },
      }).success
    ).toBe(false);
  });

  it("rejects a malformed performance URL without throwing", () => {
    const result = entryMutationSchema.safeParse({
      ...note,
      kind: "performance",
      performance: {
        workTitle: "Etude",
        composer: "Chopin",
        youtubeUrl: "not a url",
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("projectMutationSchema", () => {
  it("accepts ordered technology tags and typed HTTP links", () => {
    expect(projectMutationSchema.parse(project)).toMatchObject(project);
  });

  it.each([
    "javascript:alert(1)",
    "mailto:person@example.com",
    "https://user:secret@example.com/path",
  ])("rejects the unsafe link %s", (url) => {
    expect(
      projectMutationSchema.safeParse({
        ...project,
        links: [{ ...project.links[0], url }],
      }).success
    ).toBe(false);
  });

  it("rejects duplicate technology tags and unknown link kinds", () => {
    expect(
      projectMutationSchema.safeParse({
        ...project,
        technologies: ["TypeScript", "typescript"],
      }).success
    ).toBe(false);
    expect(
      projectMutationSchema.safeParse({
        ...project,
        links: [{ ...project.links[0], kind: "source" }],
      }).success
    ).toBe(false);
  });
});

describe("commentMutationSchema", () => {
  const comment = {
    entryId: "00000000-0000-4000-8000-000000000001",
    authorName: "Reader",
    body: "Thoughtful post.",
  };

  it("accepts an anonymous comment", () => {
    expect(commentMutationSchema.parse({ entryId: comment.entryId, body: comment.body })).toEqual({
      entryId: comment.entryId,
      body: comment.body,
    });
  });

  it("enforces author name and body size limits", () => {
    expect(
      commentMutationSchema.safeParse({ ...comment, authorName: "x".repeat(81) }).success
    ).toBe(false);
    expect(commentMutationSchema.safeParse({ ...comment, body: "" }).success).toBe(false);
    expect(
      commentMutationSchema.safeParse({ ...comment, body: "x".repeat(4001) }).success
    ).toBe(false);
    expect(commentMutationSchema.safeParse(comment).success).toBe(true);
  });

  it("does not let anonymous submissions set moderation or author replies", () => {
    expect(
      commentMutationSchema.safeParse({
        ...comment,
        moderationStatus: "approved",
      }).success
    ).toBe(false);
    expect(
      commentMutationSchema.safeParse({
        ...comment,
        authorReplyMarkdown: "A reply from the site owner",
      }).success
    ).toBe(false);
  });
});

describe("trusted comment mutation schemas", () => {
  const commentId = "00000000-0000-4000-8000-000000000002";

  it("validates moderation separately from anonymous submissions", () => {
    expect(
      commentModerationMutationSchema.parse({
        commentId,
        moderationStatus: "approved",
      })
    ).toEqual({ commentId, moderationStatus: "approved" });
    expect(
      commentModerationMutationSchema.safeParse({
        commentId,
        moderationStatus: "approved",
        body: "Replaced body",
      }).success
    ).toBe(false);
  });

  it("validates author replies separately from anonymous submissions", () => {
    expect(
      commentReplyMutationSchema.parse({
        commentId,
        authorReplyMarkdown: "Thanks for reading.",
      })
    ).toEqual({ commentId, authorReplyMarkdown: "Thanks for reading." });
    expect(
      commentReplyMutationSchema.safeParse({
        commentId,
        authorReplyMarkdown: "",
      }).success
    ).toBe(false);
  });
});
