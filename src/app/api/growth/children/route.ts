import { createChild } from "@/lib/growth-db";
import { handle, jsonBody } from "../_shared";

export async function POST(req: Request) {
  const body = await jsonBody(req);
  return handle(() => createChild(body), 201);
}
