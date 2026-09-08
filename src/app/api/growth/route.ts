import { NextResponse } from "next/server";
import { listChildren, listMeasurements } from "@/lib/growth-db";

/** Everything the growth page needs in one round trip. */
export async function GET() {
  return NextResponse.json({ children: listChildren(), measurements: listMeasurements() });
}
