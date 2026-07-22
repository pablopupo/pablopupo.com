import { afterEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "../db/test-database";

const clients: PGlite[] = [];
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

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
}, PGLITE_TEST_TIMEOUT_MS);

describe("admin access integration", () => {
  it("returns unconfigured without attempting auth or database initialization", async () => {
    for (const key of environmentKeys) delete process.env[key];
    const module = await import("./access").catch(() => undefined);

    expect(module).toBeDefined();
    await expect(module!.getAdminAccess(new Headers())).resolves.toEqual({
      status: "unconfigured",
    });
  });

  it("looks up only linked GitHub provider account IDs for the session user", async () => {
    const client = await createMigratedDatabase();
    expect(client).toBeDefined();
    if (!client) throw new Error("Generated migrations are required");
    clients.push(client);
    await client.exec(
      `INSERT INTO "user" (id, name, email)
       VALUES
         ('user-1', 'Owner', 'owner@example.com'),
         ('user-2', 'Other', 'other@example.com');
       INSERT INTO account (id, account_id, provider_id, user_id)
       VALUES
         ('account-1', '12345678', 'github', 'user-1'),
         ('account-2', 'not-github', 'google', 'user-1'),
         ('account-3', '87654321', 'github', 'user-2');`
    );
    const module = await import("./access").catch(() => undefined);

    expect(module?.createGitHubAccountLookup).toBeTypeOf("function");
    const lookup = module!.createGitHubAccountLookup(drizzle(client, { schema }));
    await expect(lookup("user-1")).resolves.toEqual(["12345678"]);
  });
}, PGLITE_TEST_TIMEOUT_MS);
