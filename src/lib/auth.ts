// Single-password login. Enabled whenever APP_PASSWORD is set (i.e. when hosted).
// Uses Web Crypto only, so it runs both in route handlers and in proxy.ts.

export const SESSION_COOKIE = "growth_session";
export const SESSION_DAYS = 30;

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

/** Deterministic session token derived from the password (and optional SESSION_SECRET). */
export async function sessionToken(): Promise<string> {
  const secret = `${process.env.APP_PASSWORD ?? ""}|${process.env.SESSION_SECRET ?? "growth-tracker"}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("growth-session-v1"));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
