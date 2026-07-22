import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAdminAccess } from "@/lib/admin/access";
import { getAdminConfigurationStatus } from "@/lib/admin/auth";
import Editor from "./editor";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Admin() {
  const configurationStatus = getAdminConfigurationStatus(process.env);
  if (!configurationStatus.configured) {
    return <Editor mode="unconfigured" configurationStatus={configurationStatus} />;
  }

  const access = await getAdminAccess(await headers());
  if (access.status === "authorized") return <Editor mode="authorized" />;
  if (access.status === "forbidden") return <Editor mode="forbidden" />;
  if (access.status === "unconfigured") {
    return <Editor mode="unconfigured" configurationStatus={configurationStatus} />;
  }
  return <Editor mode="signed-out" />;
}
