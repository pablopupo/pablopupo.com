import { withAdminGraphHandlers } from "@/lib/admin/server";

export function GET(request: Request) {
  return withAdminGraphHandlers((handlers) => handlers.list(request));
}

export function POST(request: Request) {
  return withAdminGraphHandlers((handlers) => handlers.createConcept(request));
}

export function PATCH(request: Request) {
  return withAdminGraphHandlers((handlers) => handlers.mutate(request));
}
