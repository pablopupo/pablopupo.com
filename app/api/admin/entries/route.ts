import { withAdminEntryHandlers } from "@/lib/admin/server";

export function GET(request: Request) {
  return withAdminEntryHandlers((handlers) => handlers.list(request));
}

export function POST(request: Request) {
  return withAdminEntryHandlers((handlers) => handlers.create(request));
}
