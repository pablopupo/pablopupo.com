import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "admin_session";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionToken(secret: string, ttlMs: number): string {
  const expires = Date.now() + ttlMs;
  return `${expires}.${sign(String(expires), secret)}`;
}

export function verifySessionToken(token: string, secret: string): boolean {
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expires = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = sign(expires, secret);
  if (mac.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

export function requireSession(req: Request): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookies = req.headers.get("cookie") ?? "";
  const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? verifySessionToken(match[1], secret) : false;
}
