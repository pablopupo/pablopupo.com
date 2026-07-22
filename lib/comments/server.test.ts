import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  createCommentRepository: vi.fn(),
  createRateLimitRepository: vi.fn(),
  createRequestRateLimiter: vi.fn(),
  readRateLimitSecret: vi.fn(),
  createPublicCommentHandlers: vi.fn(),
}));

vi.mock("../db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("./repository", () => ({
  createCommentRepository: mocks.createCommentRepository,
}));
vi.mock("../rate-limit/repository", () => ({
  createRateLimitRepository: mocks.createRateLimitRepository,
}));
vi.mock("../rate-limit/service", () => ({
  createRequestRateLimiter: mocks.createRequestRateLimiter,
  readRateLimitSecret: mocks.readRateLimitSecret,
}));
vi.mock("./handlers", () => ({
  createPublicCommentHandlers: mocks.createPublicCommentHandlers,
}));

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalSecret = process.env.BETTER_AUTH_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgres://configured";
  process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  mocks.readRateLimitSecret.mockReturnValue(process.env.BETTER_AUTH_SECRET);
  mocks.getDatabase.mockReturnValue({ database: true });
  mocks.createCommentRepository.mockReturnValue({ comments: true });
  mocks.createRateLimitRepository.mockReturnValue({ buckets: true });
  mocks.createRequestRateLimiter.mockReturnValue({ take: vi.fn() });
  mocks.createPublicCommentHandlers.mockReturnValue({ create: vi.fn() });
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = originalSecret;
});

describe("public comment server wiring", () => {
  it.each(["DATABASE_URL", "BETTER_AUTH_SECRET"])(
    "returns 503 when %s is unavailable",
    async (name) => {
      if (name === "DATABASE_URL") delete process.env.DATABASE_URL;
      else mocks.readRateLimitSecret.mockReturnValue(undefined);
      const { withPublicCommentHandlers } = await import("./server");
      const operation = vi.fn();

      const response = await withPublicCommentHandlers(operation);

      expect(response.status).toBe(503);
      expect(operation).not.toHaveBeenCalled();
      expect(mocks.getDatabase).not.toHaveBeenCalled();
    }
  );

  it("wires the shared database limiter into comment submission", async () => {
    const { withPublicCommentHandlers } = await import("./server");
    const operation = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    await withPublicCommentHandlers(operation);

    expect(mocks.createRateLimitRepository).toHaveBeenCalledWith({ database: true });
    expect(mocks.createRequestRateLimiter).toHaveBeenCalledWith(
      { buckets: true },
      process.env.BETTER_AUTH_SECRET
    );
    expect(mocks.createPublicCommentHandlers).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: { comments: true },
        rateLimit: expect.any(Function),
      })
    );
    const dependencies = mocks.createPublicCommentHandlers.mock.calls[0]![0];
    const now = new Date("2026-07-22T12:00:00Z");
    const request = new Request("https://pablopupo.com/api/comments");
    await dependencies.rateLimit(request, now);
    expect(mocks.createRequestRateLimiter.mock.results[0]!.value.take).toHaveBeenCalledWith(
      "comments",
      request,
      now
    );
  });
});
