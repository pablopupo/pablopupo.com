import type { Metadata } from "next";
import { AdminAccessState } from "../admin-shell";
import { loadAdminRouteState } from "../admin-route";
import AnalyticsDashboard from "./analytics-dashboard";

export const metadata: Metadata = { title: "Analytics admin" };
export const dynamic = "force-dynamic";

export default async function AnalyticsAdminPage() {
  const state = await loadAdminRouteState();
  if (state.mode !== "authorized") return <AdminAccessState state={state} />;
  return <AnalyticsDashboard />;
}
