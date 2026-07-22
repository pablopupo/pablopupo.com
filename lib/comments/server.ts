import { getAdminAccess } from "../admin/access";
import { hasSameOrigin, readAdminConfiguration } from "../admin/auth";
import { getDatabase } from "../db/client";
import { createRateLimitRepository } from "../rate-limit/repository";
import {
  createRequestRateLimiter,
  readRateLimitSecret,
} from "../rate-limit/service";
import { createAdminCommentHandlers } from "./admin-handlers";
import { createPublicCommentHandlers } from "./handlers";
import { createCommentRepository } from "./repository";

type PublicHandlers = ReturnType<typeof createPublicCommentHandlers>;
type AdminHandlers = ReturnType<typeof createAdminCommentHandlers>;

export async function withPublicCommentHandlers(
  operation: (handlers: PublicHandlers) => Promise<Response>
) {
  const secret = readRateLimitSecret(process.env);
  if (!process.env.DATABASE_URL?.trim() || !secret) {
    return Response.json(
      { error: "Comments are unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
  const database = getDatabase();
  const limiter = createRequestRateLimiter(
    createRateLimitRepository(database),
    secret
  );
  const handlers = createPublicCommentHandlers({
    repository: createCommentRepository(database),
    isSameOrigin: (request) => hasSameOrigin(request, request.url),
    rateLimit: (request, now) => limiter.take("comments", request, now),
    now: () => new Date(),
  });
  return operation(handlers);
}

export async function withAdminCommentHandlers(
  operation: (handlers: AdminHandlers) => Promise<Response>
) {
  const configuration = readAdminConfiguration(process.env);
  if (!configuration) {
    return Response.json(
      { error: "admin is not configured" },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
  const handlers = createAdminCommentHandlers({
    authorize: getAdminAccess,
    isSameOrigin: (request) =>
      hasSameOrigin(request, configuration.betterAuthUrl),
    now: () => new Date(),
    repository: createCommentRepository(getDatabase()),
  });
  return operation(handlers);
}
