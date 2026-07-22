import type { Metadata } from "next";
import { AdminAccessState } from "../admin-shell";
import { loadAdminRouteState } from "../admin-route";
import CommentsManager from "../comments-manager";

export const metadata: Metadata = { title: "Comments admin" };
export const dynamic = "force-dynamic";

export default async function CommentsAdminPage() {
  const state = await loadAdminRouteState();
  if (state.mode !== "authorized") return <AdminAccessState state={state} />;
  return <CommentsManager />;
}
