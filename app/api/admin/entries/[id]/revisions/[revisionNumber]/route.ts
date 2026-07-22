import { withAdminEntryHandlers } from "@/lib/admin/server";

type RevisionRouteContext = {
  params: Promise<{ id: string; revisionNumber: string }>;
};

export async function GET(request: Request, context: RevisionRouteContext) {
  const { id, revisionNumber } = await context.params;
  return withAdminEntryHandlers((handlers) =>
    handlers.revision(request, id, revisionNumber)
  );
}
