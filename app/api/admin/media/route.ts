import { withAdminMediaHandlers } from "@/lib/admin/server";

export function GET(request: Request) {
  return withAdminMediaHandlers((handlers) => handlers.list(request));
}

export function POST(request: Request) {
  return withAdminMediaHandlers((handlers) => handlers.upload(request));
}
