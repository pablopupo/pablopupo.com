import { withAdminProjectHandlers } from "@/lib/admin/server";

type ProjectRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: ProjectRouteContext) {
  const { id } = await context.params;
  return withAdminProjectHandlers((handlers) => handlers.load(request, id));
}

export async function PATCH(request: Request, context: ProjectRouteContext) {
  const { id } = await context.params;
  return withAdminProjectHandlers((handlers) => handlers.update(request, id));
}

export async function DELETE(request: Request, context: ProjectRouteContext) {
  const { id } = await context.params;
  return withAdminProjectHandlers((handlers) => handlers.remove(request, id));
}
