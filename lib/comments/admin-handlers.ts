import { z } from "zod";
import {
  commentModerationMutationSchema,
  commentReplyMutationSchema,
} from "../db/validation";
import {
  decodeCommentCursor,
  type AdminCommentListOptions,
} from "./repository";

type AdminAccess =
  | { status: "unconfigured" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "authorized"; userId: string };

type AdminCommentRepository = {
  listComments: (
    options: AdminCommentListOptions
  ) => Promise<{ comments: unknown[]; nextCursor: string | null }>;
  moderateComment: (
    commentId: string,
    moderationStatus: "pending" | "approved" | "rejected" | "spam",
    now?: Date
  ) => Promise<unknown | undefined>;
  replyToComment: (
    commentId: string,
    authorReplyMarkdown: string | null,
    now?: Date
  ) => Promise<unknown | undefined>;
};

type AdminCommentHandlerDependencies = {
  authorize: (headers: Headers) => Promise<AdminAccess>;
  isSameOrigin: (request: Request) => boolean;
  now: () => Date;
  repository: AdminCommentRepository;
};

const noStoreHeaders = { "cache-control": "no-store" };
const adminCommentActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("moderate"),
      moderationStatus: z.enum(["pending", "approved", "rejected", "spam"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("reply"),
      authorReplyMarkdown: z.string().trim().min(1).max(4000).nullable(),
    })
    .strict(),
]);
const adminCommentListSchema = z.object({
  status: z
    .enum(["pending", "approved", "rejected", "spam", "all"])
    .default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .max(128)
    .refine((value) => decodeCommentCursor(value) !== undefined)
    .optional(),
});

function accessResponse(access: AdminAccess) {
  if (access.status === "unconfigured") {
    return Response.json(
      { error: "admin is not configured" },
      { status: 503, headers: noStoreHeaders }
    );
  }
  if (access.status === "unauthenticated") {
    return Response.json(
      { error: "authentication required" },
      { status: 401, headers: noStoreHeaders }
    );
  }
  if (access.status === "forbidden") {
    return Response.json(
      { error: "owner access required" },
      { status: 403, headers: noStoreHeaders }
    );
  }
  return undefined;
}

export function createAdminCommentHandlers(
  dependencies: AdminCommentHandlerDependencies
) {
  async function authorize(request: Request, mutation: boolean) {
    const rejection = accessResponse(
      await dependencies.authorize(request.headers)
    );
    if (rejection) return rejection;
    if (mutation && !dependencies.isSameOrigin(request)) {
      return Response.json(
        { error: "same-origin request required" },
        { status: 403, headers: noStoreHeaders }
      );
    }
    return undefined;
  }

  return {
    async list(request: Request) {
      const rejection = await authorize(request, false);
      if (rejection) return rejection;
      const parameters = new URL(request.url).searchParams;
      const query = adminCommentListSchema.safeParse({
        status: parameters.get("status") ?? undefined,
        limit: parameters.get("limit") ?? undefined,
        cursor: parameters.get("cursor") ?? undefined,
      });
      if (!query.success) {
        return Response.json(
          { error: "validation failed" },
          { status: 422, headers: noStoreHeaders }
        );
      }
      return Response.json(
        await dependencies.repository.listComments(query.data),
        { headers: noStoreHeaders }
      );
    },

    async update(request: Request, commentId: string) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const body = await request.json().catch(() => undefined);
      const action = adminCommentActionSchema.safeParse(body);
      if (!action.success) {
        return Response.json(
          { error: "validation failed" },
          { status: 422, headers: noStoreHeaders }
        );
      }

      if (action.data.action === "moderate") {
        const moderation = commentModerationMutationSchema.safeParse({
          commentId,
          moderationStatus: action.data.moderationStatus,
        });
        if (!moderation.success) {
          return Response.json(
            { error: "validation failed" },
            { status: 422, headers: noStoreHeaders }
          );
        }
        const comment = await dependencies.repository.moderateComment(
          moderation.data.commentId,
          moderation.data.moderationStatus,
          dependencies.now()
        );
        if (!comment) {
          return Response.json(
            { error: "comment not found" },
            { status: 404, headers: noStoreHeaders }
          );
        }
        return Response.json({ comment }, { headers: noStoreHeaders });
      }

      const reply = commentReplyMutationSchema.safeParse({
        commentId,
        authorReplyMarkdown: action.data.authorReplyMarkdown,
      });
      if (!reply.success) {
        return Response.json(
          { error: "validation failed" },
          { status: 422, headers: noStoreHeaders }
        );
      }
      const comment = await dependencies.repository.replyToComment(
        reply.data.commentId,
        reply.data.authorReplyMarkdown,
        dependencies.now()
      );
      if (!comment) {
        return Response.json(
          { error: "comment not found" },
          { status: 404, headers: noStoreHeaders }
        );
      }
      return Response.json({ comment }, { headers: noStoreHeaders });
    },
  };
}
