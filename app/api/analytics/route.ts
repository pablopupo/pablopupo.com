import { withAnalyticsHandlers } from "@/lib/analytics/server";

export function POST(request: Request) {
  return withAnalyticsHandlers((handlers) => handlers.record(request));
}
