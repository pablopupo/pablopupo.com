import { withAdminProjectHandlers } from "@/lib/admin/server";

export function GET(request: Request) {
  return withAdminProjectHandlers((handlers) => handlers.list(request));
}

export function POST(request: Request) {
  return withAdminProjectHandlers((handlers) => handlers.create(request));
}
