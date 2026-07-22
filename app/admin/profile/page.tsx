import type { Metadata } from "next";
import { AdminAccessState } from "../admin-shell";
import { loadAdminRouteState } from "../admin-route";
import ProfileEditor from "../profile-editor";

export const metadata: Metadata = { title: "Profile admin" };
export const dynamic = "force-dynamic";

export default async function ProfileAdminPage() {
  const state = await loadAdminRouteState();
  if (state.mode !== "authorized") return <AdminAccessState state={state} />;
  return <ProfileEditor />;
}
