import { CommentEntryUnavailableError } from "./repository";
import {
  commentEntryIdSchema,
  publicCommentSubmissionSchema,
} from "./validation";

type PublicComment = {
  id: string;
  authorName: string | null;
  body: string;
  authorReplyMarkdown: string | null;
  authorRepliedAt: Date | null;
  createdAt: Date;
};

type PublicCommentRepository = {
  listApprovedComments: (
    entryId: string,
    now?: Date
  ) => Promise<PublicComment[] | undefined>;
  createPendingComment: (
    input: { entryId: string; authorName?: string; body: string },
    now?: Date
  ) => Promise<unknown>;
};

type PublicCommentHandlerDependencies = {
  repository: PublicCommentRepository;
  isSameOrigin: (request: Request) => boolean;
  rateLimit: (
    request: Request,
    now: Date
  ) => Promise<{ allowed: boolean; retryAfter: number }>;
  now: () => Date;
};

const noStoreHeaders = { "cache-control": "no-store" };
const acceptedMessage = "Thanks. Your comment is awaiting moderation.";
const maximumRequestBytes = 8 * 1024;

function acceptedResponse() {
  return Response.json(
    { message: acceptedMessage },
    { status: 202, headers: noStoreHeaders }
  );
}

function invalidResponse() {
  return Response.json(
    { error: "Check your name and comment and try again." },
    { status: 422, headers: noStoreHeaders }
  );
}

function tooLargeResponse() {
  return Response.json(
    { error: "The comment is too large." },
    { status: 413, headers: noStoreHeaders }
  );
}

async function readBoundedJson(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    if (Number(declaredLength) > maximumRequestBytes) {
      return { status: "too-large" as const };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return { status: "invalid" as const };
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    byteLength += chunk.value.byteLength;
    if (byteLength > maximumRequestBytes) {
      await reader.cancel().catch(() => undefined);
      return { status: "too-large" as const };
    }
    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { status: "ok" as const, value: JSON.parse(text) as unknown };
  } catch {
    return { status: "invalid" as const };
  }
}

function entryIdFrom(request: Request) {
  try {
    return new URL(request.url).searchParams.get("entryId") ?? "";
  } catch {
    return "";
  }
}

export function createPublicCommentHandlers(
  dependencies: PublicCommentHandlerDependencies
) {
  return {
    async list(request: Request) {
      const parsedEntryId = commentEntryIdSchema.safeParse(entryIdFrom(request));
      if (!parsedEntryId.success) {
        return Response.json(
          { error: "Comments are unavailable for this entry." },
          { status: 404, headers: noStoreHeaders }
        );
      }
      const comments = await dependencies.repository.listApprovedComments(
        parsedEntryId.data,
        dependencies.now()
      );
      if (!comments) {
        return Response.json(
          { error: "Comments are unavailable for this entry." },
          { status: 404, headers: noStoreHeaders }
        );
      }
      return Response.json({ comments }, { headers: noStoreHeaders });
    },

    async create(request: Request) {
      if (!dependencies.isSameOrigin(request)) {
        return Response.json(
          { error: "This request is not allowed." },
          { status: 403, headers: noStoreHeaders }
        );
      }
      if (
        !request.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/json")
      ) {
        return Response.json(
          { error: "The comment format is not supported." },
          { status: 415, headers: noStoreHeaders }
        );
      }

      const parsedBody = await readBoundedJson(request);
      if (parsedBody.status === "too-large") return tooLargeResponse();
      if (parsedBody.status === "invalid") return invalidResponse();
      const submission = publicCommentSubmissionSchema.safeParse({
        ...(typeof parsedBody.value === "object" && parsedBody.value
          ? parsedBody.value
          : {}),
        entryId: entryIdFrom(request),
      });
      if (!submission.success) return invalidResponse();
      if (submission.data.website.trim()) return acceptedResponse();
      const now = dependencies.now();
      let limit: { allowed: boolean; retryAfter: number };
      try {
        limit = await dependencies.rateLimit(request, now);
      } catch {
        return Response.json(
          { error: "Comments are temporarily unavailable." },
          { status: 503, headers: noStoreHeaders }
        );
      }
      if (!limit.allowed) {
        return acceptedResponse();
      }

      try {
        await dependencies.repository.createPendingComment(
          {
            entryId: submission.data.entryId,
            ...(submission.data.authorName
              ? { authorName: submission.data.authorName }
              : {}),
            body: submission.data.body,
          },
          now
        );
        return acceptedResponse();
      } catch (error) {
        if (error instanceof CommentEntryUnavailableError) {
          return Response.json(
            { error: "Comments are unavailable for this entry." },
            { status: 404, headers: noStoreHeaders }
          );
        }
        return Response.json(
          { error: "The comment could not be submitted." },
          { status: 500, headers: noStoreHeaders }
        );
      }
    },
  };
}
