import { withAdminSettingsHandlers } from "@/lib/admin/server";

export function GET(request: Request) {
  return withAdminSettingsHandlers((handlers) => handlers.load(request));
}

export function PATCH(request: Request) {
  return withAdminSettingsHandlers((handlers) => handlers.update(request));
}
