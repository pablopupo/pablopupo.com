import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: { kind: "pool-database" },
  drizzle: vi.fn(),
  migrate: vi.fn(),
  oldMigrate: vi.fn(),
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

vi.mock("drizzle-orm/neon-serverless/migrator", () => ({
  migrate: mocks.migrate,
}));

vi.mock("drizzle-orm/neon-http/migrator", () => ({
  migrate: mocks.oldMigrate,
}));

const originalDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DATABASE_URL;
  mocks.Pool.mockImplementation(function Pool() {
    return mocks.pool;
  });
  mocks.drizzle.mockReturnValue(mocks.database);
  mocks.migrate.mockResolvedValue(undefined);
  mocks.oldMigrate.mockRejectedValue(new Error("legacy migration path invoked"));
  mocks.pool.end.mockResolvedValue(undefined);
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  vi.resetModules();
});

describe("database migration script", () => {
  it("rejects missing configuration before constructing a Pool", async () => {
    await expect(import("./migrate")).rejects.toThrowError(
      "DATABASE_URL is required before running database migrations"
    );

    expect(mocks.Pool).not.toHaveBeenCalled();
    expect(mocks.drizzle).not.toHaveBeenCalled();
    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it("runs migrations through a Pool and closes it after success", async () => {
    process.env.DATABASE_URL =
      "postgres://user:password@example.com/database";

    await import("./migrate");

    expect(mocks.Pool).toHaveBeenCalledWith({
      connectionString: "postgres://user:password@example.com/database",
    });
    expect(mocks.drizzle).toHaveBeenCalledWith(mocks.pool);
    expect(mocks.migrate).toHaveBeenCalledWith(mocks.database, {
      migrationsFolder: "drizzle",
    });
    expect(mocks.pool.end).toHaveBeenCalledTimes(1);
    expect(mocks.oldMigrate).not.toHaveBeenCalled();
  });

  it("awaits Pool cleanup when migration execution fails", async () => {
    process.env.DATABASE_URL =
      "postgres://user:password@example.com/database";
    const failure = new Error("migration failed");
    let closedBeforeRejection = false;
    mocks.migrate.mockRejectedValue(failure);
    mocks.pool.end.mockImplementation(async () => {
      await Promise.resolve();
      closedBeforeRejection = true;
    });

    await expect(import("./migrate")).rejects.toBe(failure);

    expect(closedBeforeRejection).toBe(true);
    expect(mocks.pool.end).toHaveBeenCalledTimes(1);
  });
});
