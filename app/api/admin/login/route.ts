import { timingSafeEqual } from "crypto";
import { createSessionToken, SESSION_COOKIE } from "@/lib/admin-session";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret) {
    return Response.json({ error: "admin not configured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    password?: string;
  } | null;
  if (!body?.password || !safeEqual(body.password, password)) {
    return Response.json({ error: "wrong password" }, { status: 401 });
  }
  const token = createSessionToken(secret, SESSION_TTL_MS);
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
    },
  });
}
