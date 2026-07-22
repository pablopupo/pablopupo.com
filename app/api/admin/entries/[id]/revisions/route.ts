import { withAdminEntryHandlers } from "@/lib/admin/server";

type RevisionsRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RevisionsRouteContext) {
  const { id } = await context.params;
  return withAdminEntryHandlers((handlers) => handlers.revisions(request, id));
}
