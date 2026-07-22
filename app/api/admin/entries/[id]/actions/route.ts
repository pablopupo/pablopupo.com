import { withAdminEntryHandlers } from "@/lib/admin/server";

type EntryActionRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: EntryActionRouteContext) {
  const { id } = await context.params;
  return withAdminEntryHandlers((handlers) => handlers.action(request, id));
}
