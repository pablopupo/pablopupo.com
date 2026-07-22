import type { Metadata } from "next";
import { AdminAccessState } from "../admin-shell";
import { loadAdminRouteState } from "../admin-route";
import MediaManager from "../media-manager";

export const metadata: Metadata = { title: "Media admin" };
export const dynamic = "force-dynamic";

export default async function MediaAdminPage() {
  const state = await loadAdminRouteState();
  if (state.mode !== "authorized") return <AdminAccessState state={state} />;
  return <MediaManager />;
}
