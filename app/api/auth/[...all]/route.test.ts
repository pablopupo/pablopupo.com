import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("Better Auth Next.js route", () => {
  it("loads without configuration and returns a clear 503 at request time", async () => {
    for (const key of environmentKeys) delete process.env[key];
    const route = await import("./route").catch(() => undefined);

    expect(route).toBeDefined();
    expect(route?.GET).toBeTypeOf("function");
    const response = await route!.GET(
      new Request("https://example.com/api/auth/get-session")
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "authentication is not configured" });
  });
});
