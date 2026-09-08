import { deleteMeasurement, updateMeasurement } from "@/lib/growth-db";
import { handle, idParam, jsonBody } from "../../_shared";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const [id, body] = await Promise.all([idParam(ctx), jsonBody(req)]);
  return handle(() => updateMeasurement(id, body));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await idParam(ctx);
  return handle(() => { deleteMeasurement(id); return { ok: true }; });
}
