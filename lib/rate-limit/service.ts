import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type {
  RateLimitResult,
  RateLimitScope,
  RateLimitTakeInput,
} from "./repository";

export const rateLimitPolicies = {
  comments: { limit: 5, windowMs: 10 * 60 * 1_000 },
  analytics: { limit: 120, windowMs: 60 * 1_000 },
} as const;

type RateLimitRepository = {
  take: (input: RateLimitTakeInput) => Promise<RateLimitResult>;
};

type RateLimitEnvironment = Readonly<Record<string, string | undefined>>;

function trustedForwardedAddress(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for");
  const address = forwarded?.split(",", 1)[0]?.trim() ?? "";
  return isIP(address) ? address : "unknown";
}

function clientKey(request: Request, scope: RateLimitScope, secret: string) {
  return createHmac("sha256", secret)
    .update(scope)
    .update("\0")
    .update(trustedForwardedAddress(request))
    .digest("hex");
}

export function readRateLimitSecret(
  environment: RateLimitEnvironment
) {
  const secret = environment.BETTER_AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : undefined;
}

export function createRequestRateLimiter(
  repository: RateLimitRepository,
  secret: string
) {
  if (secret.length < 32) throw new Error("Invalid rate-limit secret");
  return {
    take(scope: RateLimitScope, request: Request, now: Date) {
      const policy = rateLimitPolicies[scope];
      return repository.take({
        scope,
        clientKey: clientKey(request, scope, secret),
        limit: policy.limit,
        windowMs: policy.windowMs,
        now,
      });
    },
  };
}
