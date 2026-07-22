import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import {
  createGitHubUserInfoLoader,
  enforceFixedGitHubScopes,
  readAdminConfiguration,
  type AdminConfiguration,
} from "./admin/auth";
import { getDatabase } from "./db/client";
import * as schema from "./db/schema";

export function createAuthInstance(
  configuration: AdminConfiguration,
  database: Parameters<typeof drizzleAdapter>[0] = getDatabase(),
  fetcher: typeof fetch = fetch
) {
  return betterAuth({
    baseURL: configuration.betterAuthUrl,
    secret: configuration.betterAuthSecret,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      github: {
        clientId: configuration.githubClientId,
        clientSecret: configuration.githubClientSecret,
        disableDefaultScope: true,
        scope: ["read:user", "user:email"],
        getUserInfo: createGitHubUserInfoLoader(
          configuration.adminGithubId,
          fetcher
        ),
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: false },
    },
    advanced: { ipAddress: { disableIpTracking: true } },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        await enforceFixedGitHubScopes({
          path: context.path,
          body: context.body,
        });
      }),
    },
  });
}

let authInstance: ReturnType<typeof createAuthInstance> | undefined;

export function getAuth() {
  const configuration = readAdminConfiguration(process.env);
  if (!configuration) return undefined;
  if (authInstance) return authInstance;

  authInstance = createAuthInstance(configuration);
  return authInstance;
}

export type Auth = NonNullable<ReturnType<typeof getAuth>>;
