import { withAdminEntryHandlers } from "@/lib/admin/server";

type EntryRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: EntryRouteContext) {
  const { id } = await context.params;
  return withAdminEntryHandlers((handlers) => handlers.load(request, id));
}

export async function PATCH(request: Request, context: EntryRouteContext) {
  const { id } = await context.params;
  return withAdminEntryHandlers((handlers) => handlers.update(request, id));
}

export async function DELETE(request: Request, context: EntryRouteContext) {
  const { id } = await context.params;
  return withAdminEntryHandlers((handlers) => handlers.remove(request, id));
}
