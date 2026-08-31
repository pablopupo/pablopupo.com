import type { Metadata } from "next";
import { AdminAccessState } from "../admin-shell";
import { loadAdminRouteState } from "../admin-route";
import GraphEditor from "../graph-editor";

export const metadata: Metadata = { title: "Graph admin" };
export const dynamic = "force-dynamic";

export default async function GraphAdminPage() {
  const state = await loadAdminRouteState();
  if (state.mode !== "authorized") return <AdminAccessState state={state} />;
  return <GraphEditor />;
}
