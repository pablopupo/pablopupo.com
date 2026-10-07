import type { Metadata } from "next";
import { AdminAccessState } from "../admin-shell";
import { loadAdminRouteState } from "../admin-route";
import PagesEditor from "../pages-editor";

export const metadata: Metadata = { title: "Pages admin" };
export const dynamic = "force-dynamic";

export default async function PagesAdminPage() {
  const state = await loadAdminRouteState();
  if (state.mode !== "authorized") return <AdminAccessState state={state} />;
  return <PagesEditor />;
}
