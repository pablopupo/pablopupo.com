import type { Metadata } from "next";
import Editor from "./editor";
import { loadAdminRouteState } from "./admin-route";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Admin() {
  const state = await loadAdminRouteState();
  return (
    <Editor
      mode={state.mode}
      configurationStatus={
        state.mode === "unconfigured" ? state.configurationStatus : undefined
      }
    />
  );
}
