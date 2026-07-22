import type { Metadata } from "next";
import { AdminAccessState } from "../admin-shell";
import { loadAdminRouteState } from "../admin-route";
import WorkEditor from "../work-editor";

export const metadata: Metadata = { title: "Work admin" };
export const dynamic = "force-dynamic";

export default async function WorkAdminPage() {
  const state = await loadAdminRouteState();
  if (state.mode !== "authorized") return <AdminAccessState state={state} />;
  return <WorkEditor />;
}
