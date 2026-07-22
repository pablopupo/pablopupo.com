import { withPublicCommentHandlers } from "@/lib/comments/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withPublicCommentHandlers((handlers) => handlers.list(request));
}

export function POST(request: Request) {
  return withPublicCommentHandlers((handlers) => handlers.create(request));
}
