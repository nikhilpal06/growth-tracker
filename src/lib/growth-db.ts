// Server-side storage and validation for the growth tracker.
import { all, get, insertRow, run, updateRow, type GrowthChild, type GrowthMeasurement } from "./db";
import { parseIsoDate, todayIso } from "./growth";

export class GrowthInputError extends Error {}

type Body = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim();
}

/** Optional positive number within a range; "" or null clear it. */
function optNumber(v: unknown, label: string, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new GrowthInputError(`${label} must be a number`);
  if (n < min || n > max) throw new GrowthInputError(`${label} must be between ${min} and ${max}`);
  return Math.round(n * 100) / 100;
}

function isoDate(v: unknown, label: string): string {
  const s = str(v);
  if (parseIsoDate(s) === null) throw new GrowthInputError(`${label} must be a valid date (YYYY-MM-DD)`);
  if (s > todayIso()) throw new GrowthInputError(`${label} cannot be in the future`);
  return s;
}

export function listChildren(): GrowthChild[] {
  return all<GrowthChild>("SELECT * FROM growth_children ORDER BY created_at ASC, id ASC");
}

export function getChild(id: number): GrowthChild | undefined {
  return get<GrowthChild>("SELECT * FROM growth_children WHERE id = ?", id);
}

export function listMeasurements(): GrowthMeasurement[] {
  return all<GrowthMeasurement>("SELECT * FROM growth_measurements ORDER BY measured_on ASC, id ASC");
}

/** Validates a child payload. With `partial`, only the provided fields are checked and returned. */
export function childInput(body: Body, partial = false) {
  const out: Record<string, string | number | null> = {};
  const has = (k: string) => !partial || k in body;
  if (has("name")) {
    const name = str(body.name);
    if (!name) throw new GrowthInputError("Name is required");
    if (name.length > 80) throw new GrowthInputError("Name is too long");
    out.name = name;
  }
  if (has("birth_date")) out.birth_date = isoDate(body.birth_date, "Birth date");
  if (has("sex")) {
    const sex = str(body.sex).toUpperCase() || "F";
    if (sex !== "F" && sex !== "M") throw new GrowthInputError("Sex must be F or M");
    out.sex = sex;
  }
  if (has("mother_height_cm")) out.mother_height_cm = optNumber(body.mother_height_cm, "Mother's height (cm)", 100, 250);
  if (has("father_height_cm")) out.father_height_cm = optNumber(body.father_height_cm, "Father's height (cm)", 100, 250);
  return out;
}

export function createChild(body: Body): GrowthChild {
  const data = childInput(body);
  data.sex = data.sex ?? "F";
  const id = insertRow("growth_children", data);
  return getChild(id)!;
}

export function updateChild(id: number, body: Body): GrowthChild {
  const existing = getChild(id);
  if (!existing) throw new GrowthInputError("Child not found");
  const data = childInput(body, true);
  const birth = (data.birth_date as string | undefined) ?? existing.birth_date;
  const earliest = get<{ d: string | null }>("SELECT MIN(measured_on) d FROM growth_measurements WHERE child_id = ?", id)?.d;
  if (earliest && earliest < birth) throw new GrowthInputError(`Birth date is after the earliest measurement (${earliest})`);
  updateRow("growth_children", id, data);
  return getChild(id)!;
}

export function deleteChild(id: number) {
  run("DELETE FROM growth_measurements WHERE child_id = ?", id);
  run("DELETE FROM growth_children WHERE id = ?", id);
}

export function measurementInput(body: Body, child: GrowthChild, partial = false) {
  const out: Record<string, string | number | null> = {};
  const has = (k: string) => !partial || k in body;
  if (has("measured_on")) {
    const d = isoDate(body.measured_on, "Date");
    if (d < child.birth_date) throw new GrowthInputError("Date is before the child's birth date");
    out.measured_on = d;
  }
  if (has("stature_cm")) out.stature_cm = optNumber(body.stature_cm, "Stature (cm)", 40, 250);
  if (has("weight_kg")) out.weight_kg = optNumber(body.weight_kg, "Weight (kg)", 2, 300);
  if (has("note")) {
    const note = str(body.note);
    if (note.length > 500) throw new GrowthInputError("Note is too long");
    out.note = note;
  }
  return out;
}

export function createMeasurement(body: Body): GrowthMeasurement {
  const childId = Number(body.child_id);
  const child = Number.isInteger(childId) ? getChild(childId) : undefined;
  if (!child) throw new GrowthInputError("Child not found");
  const data = measurementInput(body, child);
  if (data.stature_cm === null && data.weight_kg === null) throw new GrowthInputError("Enter a stature, a weight, or both");
  const id = insertRow("growth_measurements", { child_id: childId, ...data });
  return get<GrowthMeasurement>("SELECT * FROM growth_measurements WHERE id = ?", id)!;
}

export function updateMeasurement(id: number, body: Body): GrowthMeasurement {
  const existing = get<GrowthMeasurement>("SELECT * FROM growth_measurements WHERE id = ?", id);
  if (!existing) throw new GrowthInputError("Measurement not found");
  const child = getChild(existing.child_id)!;
  const data = measurementInput(body, child, true);
  const merged = { ...existing, ...data };
  if (merged.stature_cm === null && merged.weight_kg === null) throw new GrowthInputError("Enter a stature, a weight, or both");
  updateRow("growth_measurements", id, data);
  return get<GrowthMeasurement>("SELECT * FROM growth_measurements WHERE id = ?", id)!;
}

export function deleteMeasurement(id: number) {
  run("DELETE FROM growth_measurements WHERE id = ?", id);
}
