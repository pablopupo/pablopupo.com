import { APIError } from "better-auth/api";

const adminConfigurationKeys = [
  "DATABASE_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "ADMIN_GITHUB_ID",
] as const;

type AdminEnvironment = Readonly<Record<string, string | undefined>>;

export type AdminConfiguration = {
  databaseUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  adminGithubId: string;
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getAdminConfigurationStatus(environment: AdminEnvironment) {
  const missing = adminConfigurationKeys.filter((key) => !environment[key]);
  const invalid = [
    environment.BETTER_AUTH_SECRET && environment.BETTER_AUTH_SECRET.length < 32
      ? "BETTER_AUTH_SECRET"
      : undefined,
    environment.BETTER_AUTH_URL && !isHttpUrl(environment.BETTER_AUTH_URL)
      ? "BETTER_AUTH_URL"
      : undefined,
    environment.ADMIN_GITHUB_ID && !/^[1-9]\d*$/.test(environment.ADMIN_GITHUB_ID)
      ? "ADMIN_GITHUB_ID"
      : undefined,
  ].filter((key): key is string => Boolean(key));

  return {
    configured: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

export function readAdminConfiguration(
  environment: AdminEnvironment
): AdminConfiguration | undefined {
  if (!getAdminConfigurationStatus(environment).configured) return undefined;
  return {
    databaseUrl: environment.DATABASE_URL!,
    githubClientId: environment.GITHUB_CLIENT_ID!,
    githubClientSecret: environment.GITHUB_CLIENT_SECRET!,
    betterAuthSecret: environment.BETTER_AUTH_SECRET!,
    betterAuthUrl: environment.BETTER_AUTH_URL!,
    adminGithubId: environment.ADMIN_GITHUB_ID!,
  };
}

export function createGitHubUserInfoLoader(
  ownerId: string,
  fetcher: typeof fetch = fetch
) {
  return async (tokens: { accessToken?: string }) => {
    if (!tokens.accessToken) return null;
    const requestHeaders = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokens.accessToken}`,
      "User-Agent": "pablopupo.com",
    };
    const profileResponse = await fetcher("https://api.github.com/user", {
      headers: requestHeaders,
      cache: "no-store",
    });
    if (!profileResponse.ok) return null;
    const profile = (await profileResponse.json()) as {
      id?: string | number;
      login?: string;
      name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    };
    if (profile.id === undefined || profile.id === null) return null;
    if (String(profile.id) !== ownerId) {
      throw new APIError("FORBIDDEN", {
        code: "OWNER_ONLY",
        message: "GitHub account is not authorized",
      });
    }

    const emailResponse = await fetcher("https://api.github.com/user/emails", {
      headers: requestHeaders,
      cache: "no-store",
    });
    if (!emailResponse.ok) return null;
    const emails = (await emailResponse.json()) as {
      email: string;
      primary: boolean;
      verified: boolean;
    }[];
    const selectedEmail = profile.email
      ? emails.find((candidate) => candidate.email === profile.email)
      : emails.find((candidate) => candidate.primary) ?? emails[0];
    const email = profile.email ?? selectedEmail?.email ?? null;

    return {
      user: {
        id: String(profile.id),
        name: profile.name || profile.login || "",
        email,
        image: profile.avatar_url ?? undefined,
        emailVerified: Boolean(
          email && emails.find((candidate) => candidate.email === email)?.verified
        ),
      },
      data: profile,
    };
  };
}

export async function enforceFixedGitHubScopes(request: {
  path: string;
  body: unknown;
}) {
  if (request.path !== "/sign-in/social" && request.path !== "/link-social") return;
  if (!request.body || typeof request.body !== "object") return;

  const body = request.body as { provider?: unknown; scopes?: unknown };
  if (body.provider !== "github" || body.scopes === undefined) return;

  throw new APIError("FORBIDDEN", {
    code: "FIXED_GITHUB_SCOPES",
    message: "GitHub OAuth scopes are fixed by the server",
  });
}

type AdminAccessDependencies = {
  configuration: AdminConfiguration | undefined;
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  getGitHubAccountIds: (userId: string) => Promise<string[]>;
};

export async function verifyAdminAccess(
  headers: Headers,
  dependencies: AdminAccessDependencies
) {
  const configuration = dependencies.configuration;
  if (!configuration) return { status: "unconfigured" as const };

  const session = await dependencies.getSession(headers);
  if (!session) return { status: "unauthenticated" as const };

  const accountIds = await dependencies.getGitHubAccountIds(session.user.id);
  if (!accountIds.includes(configuration.adminGithubId)) {
    return { status: "forbidden" as const };
  }

  return { status: "authorized" as const, userId: session.user.id };
}

export function hasSameOrigin(request: Request, configuredUrl: string) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return (
      new URL(origin).origin === new URL(request.url).origin &&
      new URL(origin).origin === new URL(configuredUrl).origin
    );
  } catch {
    return false;
  }
}
