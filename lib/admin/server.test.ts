import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: { kind: "pool-database" },
  drizzle: vi.fn(),
  pool: { end: vi.fn() },
  Pool: vi.fn(),
}));

vi.mock("@neondatabase/serverless", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@neondatabase/serverless")>()),
  Pool: mocks.Pool,
}));

vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: mocks.drizzle,
}));

const environmentKeys = [
  "DATABASE_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "ADMIN_GITHUB_ID",
] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.Pool.mockImplementation(function Pool() {
    return mocks.pool;
  });
  mocks.drizzle.mockReturnValue(mocks.database);
  mocks.pool.end.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("admin entry server runner", () => {
  it("returns 503 without constructing handlers when configuration is absent", async () => {
    for (const key of environmentKeys) delete process.env[key];
    const operation = vi.fn();
    const server = await import("./server").catch(() => undefined);

    expect(server?.withAdminEntryHandlers).toBeTypeOf("function");
    const response = await server!.withAdminEntryHandlers(operation);

    expect(response.status).toBe(503);
    expect(operation).not.toHaveBeenCalled();
    expect(mocks.Pool).not.toHaveBeenCalled();
  });

  it("uses a request-scoped Pool database and closes it after success", async () => {
    configureEnvironment();
    const server = await import("./server");
    const operation = vi.fn().mockResolvedValue(
      Response.json({ ok: true })
    );

    const response = await server.withAdminEntryHandlers(operation);

    expect(response.status).toBe(200);
    expect(mocks.Pool).toHaveBeenCalledWith({
      connectionString: "postgres://user:password@example.com/database",
    });
    expect(mocks.drizzle).toHaveBeenCalledWith(mocks.pool, {
      schema: expect.any(Object),
    });
    expect(operation).toHaveBeenCalledWith(
      expect.objectContaining({
        list: expect.any(Function),
        create: expect.any(Function),
        update: expect.any(Function),
      })
    );
    expect(mocks.pool.end).toHaveBeenCalledTimes(1);
  });

  it("awaits Pool cleanup when the handler operation throws", async () => {
    configureEnvironment();
    const server = await import("./server");
    const failure = new Error("operation failed");
    let closedBeforeRejection = false;
    mocks.pool.end.mockImplementation(async () => {
      await Promise.resolve();
      closedBeforeRejection = true;
    });

    await expect(
      server.withAdminEntryHandlers(async () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(closedBeforeRejection).toBe(true);
    expect(mocks.pool.end).toHaveBeenCalledTimes(1);
  });
});

function configureEnvironment() {
  process.env.DATABASE_URL = "postgres://user:password@example.com/database";
  process.env.GITHUB_CLIENT_ID = "github-client";
  process.env.GITHUB_CLIENT_SECRET = "github-secret";
  process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.BETTER_AUTH_URL = "https://example.com";
  process.env.ADMIN_GITHUB_ID = "12345678";
}
