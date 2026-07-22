import { z } from "zod";
import { analyzeAuthoringMarkdown } from "../markdown/youtube";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase URL-safe words separated by hyphens");

const safeHttpUrlSchema = z
  .string()
  .max(2048)
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: "custom", message: "Enter a valid URL" });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      context.addIssue({ code: "custom", message: "Only HTTP(S) links are allowed" });
    }
    if (url.username || url.password) {
      context.addIssue({ code: "custom", message: "Links cannot contain credentials" });
    }
  });

const youtubeUrlSchema = safeHttpUrlSchema.refine(
  (value) => {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return (
        hostname === "youtu.be" ||
        hostname === "youtube.com" ||
        hostname.endsWith(".youtube.com")
      );
    } catch {
      return false;
    }
  },
  { message: "Enter a YouTube URL" }
);

const publicationStatusSchema = z.enum(["draft", "scheduled", "published", "archived"]);
const publicationDateSchema = z.coerce.date().nullable().optional();

export function normalizeDueScheduledPublication<T>(value: T, now: Date): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const publication = value as Record<string, unknown>;
  if (publication.status !== "scheduled") return value;
  const publishedAt =
    publication.publishedAt instanceof Date
      ? publication.publishedAt
      : typeof publication.publishedAt === "string" ||
          typeof publication.publishedAt === "number"
        ? new Date(publication.publishedAt)
        : undefined;
  if (
    !publishedAt ||
    Number.isNaN(publishedAt.getTime()) ||
    publishedAt.getTime() > now.getTime()
  ) {
    return value;
  }
  return { ...publication, status: "published" } as T;
}
export const entryTagsSchema = z
  .array(z.string().trim().min(1).max(50))
  .max(20)
  .superRefine((tags, context) => {
    const seen = new Set<string>();
    tags.forEach((tag, index) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Entry tags must be unique",
        });
      }
      seen.add(key);
    });
  });

function validatePublication(
  value: { status: z.infer<typeof publicationStatusSchema>; publishedAt?: Date | null },
  context: z.RefinementCtx
) {
  if (value.status === "scheduled") {
    if (!value.publishedAt) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Scheduled content needs a publication time",
      });
    } else if (value.publishedAt.getTime() <= Date.now()) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Scheduled publication time must be in the future",
      });
    }
  }
  if (value.status === "published") {
    if (!value.publishedAt) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Published content needs a publication time",
      });
    } else if (value.publishedAt.getTime() > Date.now()) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Published content cannot have a future publication time",
      });
    }
  }
}

const performanceMetadataSchema = z
  .object({
    workTitle: z.string().trim().min(1).max(200),
    composer: z.string().trim().min(1).max(200),
    venue: z.string().trim().min(1).max(200).optional(),
    performedAt: z.coerce.date().nullable().optional(),
    youtubeUrl: youtubeUrlSchema,
    notesMarkdown: z.string().max(20_000).optional(),
  })
  .strict();

export const entryMutationSchema = z
  .object({
    slug: slugSchema,
    kind: z.enum(["note", "essay", "performance"]),
    section: z.enum(["writing", "music"]),
    tags: entryTagsSchema,
    status: publicationStatusSchema,
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(500).nullable().optional(),
    bodyMarkdown: z.string().max(250_000),
    coverMediaId: z.uuid().nullable().optional(),
    publishedAt: publicationDateSchema,
    performance: performanceMetadataSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const issue of analyzeAuthoringMarkdown(value.bodyMarkdown).issues) {
      context.addIssue({
        code: "custom",
        path: ["bodyMarkdown"],
        message: issue,
      });
    }
    validatePublication(value, context);
    if (value.kind === "performance" && !value.performance) {
      context.addIssue({
        code: "custom",
        path: ["performance"],
        message: "Performance entries need performance metadata",
      });
    }
    if (value.kind !== "performance" && value.performance) {
      context.addIssue({
        code: "custom",
        path: ["performance"],
        message: "Performance metadata is only valid for performance entries",
      });
    }
  });

const projectLinkSchema = z
  .object({
    kind: z.enum(["repository", "live", "demo", "writeup", "other"]),
    label: z.string().trim().min(1).max(80),
    url: safeHttpUrlSchema,
    sortOrder: z.number().int().min(0),
  })
  .strict();

export const projectMutationSchema = z
  .object({
    slug: slugSchema,
    kind: z.enum(["project", "experience"]),
    status: publicationStatusSchema,
    title: z.string().trim().min(1).max(200),
    organization: z.string().trim().min(1).max(200).nullable().optional(),
    summary: z.string().trim().max(500).nullable().optional(),
    bodyMarkdown: z.string().max(250_000),
    coverMediaId: z.uuid().nullable().optional(),
    startedOn: z.iso.date().nullable().optional(),
    endedOn: z.iso.date().nullable().optional(),
    publishedAt: publicationDateSchema,
    sortOrder: z.number().int().min(0),
    featured: z.boolean().optional(),
    technologies: z.array(z.string().trim().min(1).max(80)).max(30),
    links: z.array(projectLinkSchema).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    validatePublication(value, context);
    const technologyNames = value.technologies.map((technology) => technology.toLowerCase());
    if (new Set(technologyNames).size !== technologyNames.length) {
      context.addIssue({
        code: "custom",
        path: ["technologies"],
        message: "Technology tags must be unique",
      });
    }
    if (value.startedOn && value.endedOn && value.startedOn > value.endedOn) {
      context.addIssue({
        code: "custom",
        path: ["endedOn"],
        message: "End date cannot precede start date",
      });
    }
  });

export const commentMutationSchema = z
  .object({
    entryId: z.uuid(),
    authorName: z.string().trim().min(1).max(80).optional(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

export const commentModerationMutationSchema = z
  .object({
    commentId: z.uuid(),
    moderationStatus: z.enum(["pending", "approved", "rejected", "spam"]),
  })
  .strict();

export const commentReplyMutationSchema = z
  .object({
    commentId: z.uuid(),
    authorReplyMarkdown: z.string().trim().min(1).max(4000).nullable(),
  })
  .strict();

export type EntryMutation = z.infer<typeof entryMutationSchema>;
export type ProjectMutation = z.infer<typeof projectMutationSchema>;
export type CommentMutation = z.infer<typeof commentMutationSchema>;
export type CommentModerationMutation = z.infer<typeof commentModerationMutationSchema>;
export type CommentReplyMutation = z.infer<typeof commentReplyMutationSchema>;
export type ProjectLinkMutation = z.infer<typeof projectLinkSchema>;
