import { z } from "zod";

export const commentEntryIdSchema = z.uuid();

const singleLineText = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));

const commentBody = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .refine(
    (value) =>
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );

export const publicCommentSubmissionSchema = z
  .object({
    entryId: commentEntryIdSchema,
    authorName: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      singleLineText.optional()
    ),
    body: commentBody,
    website: z.string().max(2048).optional().default(""),
  })
  .strict();

export type PublicCommentSubmission = z.infer<
  typeof publicCommentSubmissionSchema
>;
