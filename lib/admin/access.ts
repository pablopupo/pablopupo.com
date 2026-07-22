import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getAuth } from "../auth";
import { getDatabase } from "../db/client";
import { account } from "../db/schema";
import type * as schema from "../db/schema";
import { readAdminConfiguration, verifyAdminAccess } from "./auth";

export function createGitHubAccountLookup<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>
) {
  return async (userId: string) => {
    const accounts = await database
      .select({ accountId: account.accountId })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "github")))
      .orderBy(asc(account.accountId));
    return accounts.map((linkedAccount) => linkedAccount.accountId);
  };
}

export async function getAdminAccess(headers: Headers) {
  const configuration = readAdminConfiguration(process.env);
  return verifyAdminAccess(headers, {
    configuration,
    getSession: async (requestHeaders) => {
      const auth = getAuth();
      if (!auth) return null;
      return auth.api.getSession({
        headers: requestHeaders,
        query: { disableCookieCache: true, disableRefresh: true },
      });
    },
    getGitHubAccountIds: configuration
      ? createGitHubAccountLookup(getDatabase())
      : async () => [],
  });
}
