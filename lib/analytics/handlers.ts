import type { AnalyticsDashboard } from "./repository";
import { parsePageViewEvent, type PageViewEvent } from "./validation";

const maximumBodyBytes = 8_192;

type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
};

type PublicAnalyticsDependencies = {
  isSameOrigin: (request: Request) => boolean;
  now: () => Date;
  rateLimit: (request: Request, now: Date) => Promise<RateLimitResult>;
  repository: {
    isTrackablePath: (path: string, now: Date) => Promise<boolean>;
    recordPageView: (event: PageViewEvent, occurredAt: Date) => Promise<void>;
  };
};

type AdminAccess =
  | { status: "unconfigured" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "authorized"; userId: string };

type AdminAnalyticsDependencies = {
  authorize: (headers: Headers) => Promise<AdminAccess>;
  now: () => Date;
  repository: {
    readDashboard: (days: number, now: Date) => Promise<AnalyticsDashboard>;
  };
};

function publicError(status: number, headers?: HeadersInit) {
  return Response.json(
    { error: status === 500 ? "request failed" : "request rejected" },
    { status, headers }
  );
}

function accessResponse(access: AdminAccess) {
  if (access.status === "unconfigured") {
    return Response.json({ error: "admin is not configured" }, { status: 503 });
  }
  if (access.status === "unauthenticated") {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }
  if (access.status === "forbidden") {
    return Response.json({ error: "owner access required" }, { status: 403 });
  }
  return undefined;
}

function requestedDays(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const keys = Array.from(searchParams.keys());
  if (keys.length === 0) return 30;
  if (keys.some((key) => key !== "days")) return undefined;
  const values = searchParams.getAll("days");
  if (values.length !== 1 || !/^(?:[1-9]|[1-8]\d|90)$/.test(values[0]!)) {
    return undefined;
  }
  return Number(values[0]);
}

export function hasSameRequestOrigin(request: Request, expectedOrigin: string) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const canonicalOrigin = new URL(expectedOrigin).origin;
    return (
      new URL(origin).origin === canonicalOrigin &&
      new URL(request.url).origin === canonicalOrigin
    );
  } catch {
    return false;
  }
}

async function readBoundedJson(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    if (Number(declaredLength) > maximumBodyBytes) {
      return { status: "too-large" as const };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return { status: "invalid" as const };
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > maximumBodyBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "too-large" as const };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { status: "invalid" as const };
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

export function createAnalyticsHandlers(
  dependencies: PublicAnalyticsDependencies
) {
  return {
    async record(request: Request) {
      if (!dependencies.isSameOrigin(request)) return publicError(403);
      const contentType = request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (contentType !== "application/json") return publicError(415);

      const parsedBody = await readBoundedJson(request);
      if (parsedBody.status === "too-large") return publicError(413);
      if (parsedBody.status === "invalid") return publicError(422);
      const event = parsePageViewEvent(parsedBody.value);
      if (!event) return publicError(422);

      const occurredAt = dependencies.now();
      let limit: RateLimitResult;
      try {
        limit = await dependencies.rateLimit(request, occurredAt);
      } catch {
        return publicError(503);
      }
      if (!limit.allowed) {
        return publicError(429, { "retry-after": String(limit.retryAfter) });
      }

      try {
        if (!(await dependencies.repository.isTrackablePath(event.path, occurredAt))) {
          return publicError(422);
        }
      } catch {
        return publicError(503);
      }

      try {
        await dependencies.repository.recordPageView(event, occurredAt);
        return new Response(null, { status: 204 });
      } catch {
        return publicError(500);
      }
    },
  };
}

export function createAdminAnalyticsHandlers(
  dependencies: AdminAnalyticsDependencies
) {
  return {
    async load(request: Request) {
      const rejection = accessResponse(
        await dependencies.authorize(request.headers)
      );
      if (rejection) return rejection;
      const days = requestedDays(request);
      if (days === undefined) {
        return Response.json({ error: "validation failed" }, { status: 422 });
      }
      try {
        const analytics = await dependencies.repository.readDashboard(
          days,
          dependencies.now()
        );
        return Response.json(
          { analytics },
          { headers: { "cache-control": "private, no-store" } }
        );
      } catch {
        return Response.json({ error: "request failed" }, { status: 500 });
      }
    },
  };
}
