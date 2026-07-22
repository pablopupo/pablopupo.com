import { withAdminCommentHandlers } from "@/lib/comments/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withAdminCommentHandlers((handlers) => handlers.list(request));
}
