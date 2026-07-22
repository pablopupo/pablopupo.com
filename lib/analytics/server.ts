import { getAdminAccess } from "../admin/access";
import { readAdminConfiguration } from "../admin/auth";
import { getDatabase } from "../db/client";
import { createRateLimitRepository } from "../rate-limit/repository";
import {
  createRequestRateLimiter,
  readRateLimitSecret,
} from "../rate-limit/service";
import { siteUrl } from "../site";
import {
  createAdminAnalyticsHandlers,
  createAnalyticsHandlers,
  hasSameRequestOrigin,
} from "./handlers";
import { createAnalyticsRepository } from "./repository";

type PublicAnalyticsHandlers = ReturnType<typeof createAnalyticsHandlers>;
type AdminAnalyticsHandlers = ReturnType<typeof createAdminAnalyticsHandlers>;

export async function withAnalyticsHandlers(
  operation: (handlers: PublicAnalyticsHandlers) => Promise<Response>
) {
  const secret = readRateLimitSecret(process.env);
  if (!process.env.DATABASE_URL?.trim() || !secret) {
    return Response.json({ error: "service unavailable" }, { status: 503 });
  }
  const database = getDatabase();
  const repository = createAnalyticsRepository(database);
  const limiter = createRequestRateLimiter(
    createRateLimitRepository(database),
    secret
  );
  return operation(
    createAnalyticsHandlers({
      isSameOrigin: (request) => hasSameRequestOrigin(request, siteUrl),
      now: () => new Date(),
      rateLimit: (request, now) => limiter.take("analytics", request, now),
      repository,
    })
  );
}

export async function withAdminAnalyticsHandlers(
  operation: (handlers: AdminAnalyticsHandlers) => Promise<Response>
) {
  if (!readAdminConfiguration(process.env)) {
    return Response.json({ error: "admin is not configured" }, { status: 503 });
  }
  const repository = createAnalyticsRepository(getDatabase());
  return operation(
    createAdminAnalyticsHandlers({
      authorize: getAdminAccess,
      now: () => new Date(),
      repository,
    })
  );
}
