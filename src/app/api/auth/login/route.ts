import { NextResponse } from "next/server";
import { authEnabled, sessionToken, timingSafeEqual, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { absoluteUrl } from "@/lib/url";

export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true, note: "Login is disabled because APP_PASSWORD is not set." });
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!timingSafeEqual(password, process.env.APP_PASSWORD!)) {
    return NextResponse.redirect(absoluteUrl(req, `/login?error=1&next=${encodeURIComponent(next)}`), 303);
  }
  const res = NextResponse.redirect(absoluteUrl(req, next.startsWith("/") ? next : "/"), 303);
  res.cookies.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:" || (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
