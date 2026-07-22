import { describe, expect, it } from "vitest";

describe("Better Auth browser client", () => {
  it("exposes social sign-in and database-session sign-out", async () => {
    const module = await import("./auth-client").catch(() => undefined);

    expect(module).toBeDefined();
    expect(module?.authClient.signIn.social).toBeTypeOf("function");
    expect(module?.authClient.signOut).toBeTypeOf("function");
  });
});
