import { afterEach, describe, expect, it, vi } from "vitest";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  vi.resetModules();
});

describe("database client", () => {
  it("can be imported without DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    const module = await import("./client");
    expect(module.getDatabase).toBeTypeOf("function");
  });

  it("reports missing DATABASE_URL only when a database is requested", async () => {
    delete process.env.DATABASE_URL;
    const { getDatabase } = await import("./client");
    expect(() => getDatabase()).toThrowError(
      "DATABASE_URL is required before performing a database operation"
    );
  });

  it("creates one lazy database instance when configured", async () => {
    process.env.DATABASE_URL = "postgres://user:password@example.com/database";
    const { getDatabase } = await import("./client");
    expect(getDatabase()).toBe(getDatabase());
  });
});
