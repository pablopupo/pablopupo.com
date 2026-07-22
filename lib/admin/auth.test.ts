import { describe, expect, it, vi } from "vitest";
import * as adminAuth from "./auth";

const configuredEnvironment = {
  DATABASE_URL: "postgres://user:password@example.com/database",
  GITHUB_CLIENT_ID: "github-client",
  GITHUB_CLIENT_SECRET: "github-secret",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "https://example.com",
  ADMIN_GITHUB_ID: "12345678",
};

const verifyAdminAccess = (
  adminAuth as typeof adminAuth & {
    verifyAdminAccess?: (
      headers: Headers,
      dependencies: {
        configuration: unknown;
        getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
        getGitHubAccountIds: (userId: string) => Promise<string[]>;
      }
    ) => Promise<unknown>;
  }
).verifyAdminAccess;

describe("admin auth configuration", () => {
  it("reports every missing server setting without reading secret values", async () => {
    expect(adminAuth.getAdminConfigurationStatus({})).toEqual({
      configured: false,
      missing: [
        "DATABASE_URL",
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "ADMIN_GITHUB_ID",
      ],
      invalid: [],
    });
  });

  it("accepts a numeric owner ID and rejects malformed server settings", () => {
    const readAdminConfiguration = (
      adminAuth as typeof adminAuth & {
        readAdminConfiguration?: (environment: typeof configuredEnvironment) => unknown;
      }
    ).readAdminConfiguration;

    expect(readAdminConfiguration).toBeTypeOf("function");
    expect(readAdminConfiguration?.(configuredEnvironment)).toEqual({
      databaseUrl: configuredEnvironment.DATABASE_URL,
      githubClientId: configuredEnvironment.GITHUB_CLIENT_ID,
      githubClientSecret: configuredEnvironment.GITHUB_CLIENT_SECRET,
      betterAuthSecret: configuredEnvironment.BETTER_AUTH_SECRET,
      betterAuthUrl: configuredEnvironment.BETTER_AUTH_URL,
      adminGithubId: configuredEnvironment.ADMIN_GITHUB_ID,
    });
    expect(
      adminAuth.getAdminConfigurationStatus({
        ...configuredEnvironment,
        BETTER_AUTH_SECRET: "short",
        BETTER_AUTH_URL: "not a url",
        ADMIN_GITHUB_ID: "pablopupo",
      })
    ).toEqual({
      configured: false,
      missing: [],
      invalid: ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "ADMIN_GITHUB_ID"],
    });
  });

  it.each(["0", "012345", "-123", "123.5", " 123"])(
    "rejects the non-canonical GitHub account ID %s",
    (adminGithubId) => {
      expect(
        adminAuth.getAdminConfigurationStatus({
          ...configuredEnvironment,
          ADMIN_GITHUB_ID: adminGithubId,
        }).invalid
      ).toContain("ADMIN_GITHUB_ID");
    }
  );

  it("loads GitHub user info only after the durable profile ID passes admission", async () => {
    const createGitHubUserInfoLoader = (
      adminAuth as typeof adminAuth & {
        createGitHubUserInfoLoader?: (
          ownerId: string,
          fetcher: typeof fetch
        ) => (tokens: { accessToken?: string }) => Promise<unknown>;
      }
    ).createGitHubUserInfoLoader;
    expect(createGitHubUserInfoLoader).toBeTypeOf("function");

    const noTokenFetch = vi.fn();
    const loadWithoutToken = createGitHubUserInfoLoader!(
      "12345678",
      noTokenFetch as unknown as typeof fetch
    );
    await expect(loadWithoutToken({})).resolves.toBeNull();
    expect(noTokenFetch).not.toHaveBeenCalled();

    const ownerFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/user")) {
        return Response.json({
          id: 12345678,
          login: "changed-login",
          name: "Pablo Pupo",
          email: null,
          avatar_url: "https://avatars.example/owner",
        });
      }
      return Response.json([
        { email: "owner@example.com", primary: true, verified: true },
      ]);
    });
    const loadOwner = createGitHubUserInfoLoader!(
      "12345678",
      ownerFetch as unknown as typeof fetch
    );

    await expect(loadOwner({ accessToken: "not-exposed" })).resolves.toMatchObject({
      user: {
        id: "12345678",
        name: "Pablo Pupo",
        email: "owner@example.com",
        emailVerified: true,
      },
    });
    expect(ownerFetch).toHaveBeenCalledTimes(2);

    const otherFetch = vi.fn().mockResolvedValue(
      Response.json({
        id: 87654321,
        login: "pablopupo",
        name: "Pablo Pupo",
        email: "owner@example.com",
        avatar_url: "https://avatars.example/other",
      })
    );
    const loadOther = createGitHubUserInfoLoader!(
      "12345678",
      otherFetch as unknown as typeof fetch
    );

    await expect(loadOther({ accessToken: "not-exposed" })).rejects.toMatchObject({
      statusCode: 403,
      body: { code: "OWNER_ONLY" },
    });
    expect(otherFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects caller-supplied GitHub OAuth scopes", async () => {
    const enforceFixedGitHubScopes = (
      adminAuth as typeof adminAuth & {
        enforceFixedGitHubScopes?: (request: {
          path: string;
          body: unknown;
        }) => Promise<void>;
      }
    ).enforceFixedGitHubScopes;

    expect(enforceFixedGitHubScopes).toBeTypeOf("function");
    await expect(
      enforceFixedGitHubScopes!({
        path: "/sign-in/social",
        body: { provider: "github", scopes: ["repo"] },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      body: { code: "FIXED_GITHUB_SCOPES" },
    });
    await expect(
      enforceFixedGitHubScopes!({
        path: "/link-social",
        body: { provider: "github", scopes: ["read:org"] },
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      enforceFixedGitHubScopes!({
        path: "/sign-in/social",
        body: { provider: "github" },
      })
    ).resolves.toBeUndefined();
  });
});

describe("admin request authorization", () => {
  it("returns an unconfigured result before attempting session access", async () => {
    expect(verifyAdminAccess).toBeTypeOf("function");
    const getSession = vi.fn();

    await expect(
      verifyAdminAccess!(new Headers(), {
        configuration: undefined,
        getSession,
        getGitHubAccountIds: vi.fn(),
      })
    ).resolves.toEqual({ status: "unconfigured" });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects a request without a database-backed session", async () => {
    expect(verifyAdminAccess).toBeTypeOf("function");

    await expect(
      verifyAdminAccess!(new Headers(), {
        configuration: readConfiguredEnvironment(),
        getSession: vi.fn().mockResolvedValue(null),
        getGitHubAccountIds: vi.fn(),
      })
    ).resolves.toEqual({ status: "unauthenticated" });
  });

  it("rejects a session whose linked GitHub account ID is not the owner", async () => {
    expect(verifyAdminAccess).toBeTypeOf("function");
    const getGitHubAccountIds = vi.fn().mockResolvedValue(["87654321"]);

    await expect(
      verifyAdminAccess!(new Headers(), {
        configuration: readConfiguredEnvironment(),
        getSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
        getGitHubAccountIds,
      })
    ).resolves.toEqual({ status: "forbidden" });
    expect(getGitHubAccountIds).toHaveBeenCalledWith("user-1");
  });

  it("authorizes only a session linked to the configured GitHub owner", async () => {
    expect(verifyAdminAccess).toBeTypeOf("function");

    await expect(
      verifyAdminAccess!(new Headers(), {
        configuration: readConfiguredEnvironment(),
        getSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
        getGitHubAccountIds: vi.fn().mockResolvedValue(["12345678"]),
      })
    ).resolves.toEqual({ status: "authorized", userId: "user-1" });
  });

  it("accepts only an explicit same-origin mutation request", () => {
    const hasSameOrigin = (
      adminAuth as typeof adminAuth & {
        hasSameOrigin?: (request: Request, configuredUrl: string) => boolean;
      }
    ).hasSameOrigin;
    expect(hasSameOrigin).toBeTypeOf("function");

    expect(
      hasSameOrigin!(
        new Request("https://example.com/api/admin/entries", {
          method: "POST",
          headers: { origin: "https://example.com" },
        }),
        "https://example.com"
      )
    ).toBe(true);
    expect(
      hasSameOrigin!(
        new Request("https://example.com/api/admin/entries", { method: "POST" }),
        "https://example.com"
      )
    ).toBe(false);
    expect(
      hasSameOrigin!(
        new Request("https://example.com/api/admin/entries", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
        "https://example.com"
      )
    ).toBe(false);
  });
});

function readConfiguredEnvironment() {
  const configuration = adminAuth.readAdminConfiguration(configuredEnvironment);
  if (!configuration) throw new Error("test configuration must be valid");
  return configuration;
}
