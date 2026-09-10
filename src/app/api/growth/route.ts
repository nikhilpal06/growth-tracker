import { NextResponse } from "next/server";
import { listChildren, listMeasurements } from "@/lib/growth-db";
import { AI_MODEL, aiEnabled } from "@/lib/growth-insight";

/** Everything the growth page needs in one round trip. */
export async function GET() {
  return NextResponse.json({ children: listChildren(), measurements: listMeasurements(), ai: aiEnabled(), model: AI_MODEL });
}
