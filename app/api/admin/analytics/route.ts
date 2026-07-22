import { withAdminAnalyticsHandlers } from "@/lib/analytics/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withAdminAnalyticsHandlers((handlers) => handlers.load(request));
}
