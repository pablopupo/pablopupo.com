import { headers } from "next/headers";
import { getAdminAccess } from "@/lib/admin/access";
import { getAdminConfigurationStatus } from "@/lib/admin/auth";

export type AdminConfigurationStatus = {
  configured: boolean;
  missing: string[];
  invalid: string[];
};

export type AdminRouteState =
  | {
      mode: "unconfigured";
      configurationStatus: AdminConfigurationStatus;
    }
  | { mode: "signed-out" }
  | { mode: "forbidden" }
  | { mode: "authorized" };

type AdminAccess = Awaited<ReturnType<typeof getAdminAccess>>;

export async function resolveAdminRouteState(
  configurationStatus: AdminConfigurationStatus,
  requestHeaders: Headers,
  authorize: (requestHeaders: Headers) => Promise<AdminAccess>
): Promise<AdminRouteState> {
  if (!configurationStatus.configured) {
    return { mode: "unconfigured", configurationStatus };
  }

  const access = await authorize(requestHeaders);
  if (access.status === "authorized") return { mode: "authorized" };
  if (access.status === "forbidden") return { mode: "forbidden" };
  if (access.status === "unconfigured") {
    return { mode: "unconfigured", configurationStatus };
  }
  return { mode: "signed-out" };
}

export async function loadAdminRouteState() {
  const configurationStatus = getAdminConfigurationStatus(process.env);
  if (!configurationStatus.configured) {
    return { mode: "unconfigured", configurationStatus } as const;
  }
  return resolveAdminRouteState(
    configurationStatus,
    await headers(),
    getAdminAccess
  );
}
