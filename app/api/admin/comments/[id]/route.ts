import { withAdminCommentHandlers } from "@/lib/comments/server";

type CommentRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: CommentRouteContext) {
  const { id } = await context.params;
  return withAdminCommentHandlers((handlers) => handlers.update(request, id));
}
