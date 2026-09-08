import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { absoluteUrl } from "@/lib/url";

export async function POST(req: Request) {
  const res = NextResponse.redirect(absoluteUrl(req, "/login"), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
