import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAdminConfiguration } from "./admin/auth";
import * as schema from "./db/schema";
import { createMigratedDatabase } from "./db/test-database";

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
const clients: PGlite[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  vi.unstubAllGlobals();
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("Better Auth server configuration", () => {
  it("imports and reports unavailable auth without server environment variables", async () => {
    for (const key of environmentKeys) delete process.env[key];

    const module = await import("./auth").catch(() => undefined);

    expect(module).toBeDefined();
    expect(module?.getAuth()).toBeUndefined();
  });

  it("creates one lazy GitHub and Drizzle auth instance when configured", async () => {
    process.env.DATABASE_URL = "postgres://user:password@example.com/database";
    process.env.GITHUB_CLIENT_ID = "github-client";
    process.env.GITHUB_CLIENT_SECRET = "github-secret";
    process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.BETTER_AUTH_URL = "https://example.com";
    process.env.ADMIN_GITHUB_ID = "12345678";

    const module = await import("./auth").catch(() => undefined);

    expect(module).toBeDefined();
    const auth = module?.getAuth();
    expect(auth).toBeDefined();
    expect(auth?.handler).toBeTypeOf("function");
    expect(auth?.api.getSession).toBeTypeOf("function");
    expect(module?.getAuth()).toBe(auth);
  });

  it("rejects a non-owner profile before any auth record is written", async () => {
    const client = await createMigratedDatabase();
    expect(client).toBeDefined();
    if (!client) throw new Error("Generated migrations are required");
    clients.push(client);
    const module = await import("./auth");
    const configuration = readAdminConfiguration({
      DATABASE_URL: "postgres://user:password@example.com/database",
      GITHUB_CLIENT_ID: "github-client",
      GITHUB_CLIENT_SECRET: "github-secret",
      BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
      BETTER_AUTH_URL: "https://example.com",
      ADMIN_GITHUB_ID: "12345678",
    });
    expect(configuration).toBeDefined();
    expect(module.createAuthInstance).toBeTypeOf("function");

    const githubFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://github.com/login/oauth/access_token") {
        return Response.json({
          access_token: "oauth-token",
          token_type: "bearer",
          scope: "read:user,user:email",
        });
      }
      if (url === "https://api.github.com/user") {
        return Response.json({
          id: 87654321,
          login: "pablopupo",
          name: "Pablo Pupo",
          email: "owner@example.com",
          avatar_url: "https://avatars.example/other",
        });
      }
      throw new Error(`Unexpected GitHub request: ${url}`);
    });
    vi.stubGlobal("fetch", githubFetch);
    const auth = module.createAuthInstance!(
      configuration!,
      drizzle(client, { schema }),
      githubFetch as unknown as typeof fetch
    );
    const signInResponse = await auth.handler(
      new Request("https://example.com/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.com",
        },
        body: JSON.stringify({
          provider: "github",
          callbackURL: "https://example.com/admin",
        }),
      })
    );
    expect(signInResponse.status).toBe(200);
    const signIn = (await signInResponse.json()) as { url: string };
    const state = new URL(signIn.url).searchParams.get("state");
    const stateCookie = signInResponse.headers.get("set-cookie")?.split(";", 1)[0];
    expect(state).toBeTruthy();
    expect(stateCookie).toBeTruthy();

    const callbackResponse = await auth.handler(
      new Request(
        `https://example.com/api/auth/callback/github?code=test-code&state=${state}`,
        { headers: { cookie: stateCookie! } }
      )
    );

    expect(callbackResponse.status).toBe(403);
    expect(githubFetch).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.any(Object)
    );
    expect(githubFetch).not.toHaveBeenCalledWith(
      "https://api.github.com/user/emails",
      expect.any(Object)
    );
    const counts = await client.query<{
      users: number;
      accounts: number;
      sessions: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM "user") AS users,
         (SELECT COUNT(*)::int FROM account) AS accounts,
         (SELECT COUNT(*)::int FROM session) AS sessions`
    );
    expect(counts.rows).toEqual([{ users: 0, accounts: 0, sessions: 0 }]);
  });
});
