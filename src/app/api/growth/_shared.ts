import { NextResponse } from "next/server";
import { GrowthInputError } from "@/lib/growth-db";

/** Runs a handler and turns validation errors into 400 responses. */
export async function handle(fn: () => unknown, status = 200) {
  try {
    return NextResponse.json(await fn(), { status });
  } catch (e) {
    if (e instanceof GrowthInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export async function idParam(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Number(id);
}
