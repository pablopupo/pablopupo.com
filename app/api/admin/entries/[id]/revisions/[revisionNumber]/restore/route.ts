import { withAdminEntryHandlers } from "@/lib/admin/server";

type RestoreRevisionRouteContext = {
  params: Promise<{ id: string; revisionNumber: string }>;
};

export async function POST(
  request: Request,
  context: RestoreRevisionRouteContext
) {
  const { id, revisionNumber } = await context.params;
  return withAdminEntryHandlers((handlers) =>
    handlers.restoreRevision(request, id, revisionNumber)
  );
}
