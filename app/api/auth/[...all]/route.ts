import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

const handlers = toNextJsHandler(async (request) => {
  const auth = getAuth();
  if (!auth) {
    return Response.json(
      { error: "authentication is not configured" },
      { status: 503 }
    );
  }
  return auth.handler(request);
});

export const GET = handlers.GET;
export const POST = handlers.POST;
