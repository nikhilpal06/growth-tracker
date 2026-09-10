// Turns a child's record into plain facts for Claude to explain. Everything numeric is computed here,
// so the model interprets numbers rather than inventing them.
import type { GrowthChild, GrowthMeasurement } from "./db";
import {
  CHART_PERCENTILES, MAX_AGE_MONTHS, MIN_AGE_MONTHS, ageInMonths, assess, bmi, formatAge, formatPercentile,
  midParentalHeight, referenceAt, todayIso,
} from "./growth";

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5";
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export const SYSTEM_PROMPT = `You help a parent understand their child's growth record. The record is plotted on the CDC 2000 "2 to 20 years: Stature-for-age and Weight-for-age percentiles" chart, and every number you are given (ages, percentiles, z-scores, velocities, flags) was computed from the CDC LMS reference tables.

How to answer:
- Write for a parent with no medical background. Warm, concrete, unhurried. Short paragraphs and short bullet lists. Use Markdown with at most three short "##" headings.
- Explain what a percentile means in one sentence the first time it matters ("58th percentile means about 58 of 100 U.S. girls her age are shorter").
- The trend matters more than any single point. Say whether the child is tracking along a curve, drifting, or crossing curves, and what that usually means.
- Use only the numbers provided. Do not estimate or invent values, and do not do arithmetic beyond simple comparisons of numbers you were given.
- If the record includes flags, describe each as something commonly worth mentioning to the pediatrician, and say plainly why it draws attention. Never name or suggest a diagnosis, condition, or treatment.
- If there are no flags, say so in a reassuring but honest way. Do not promise that everything is fine.
- Mention measurement noise when it is plausible: home measurements, shoes, time of day, and a wriggly child easily move stature by a centimeter or more, which can look like a percentile jump.
- End with two or three specific questions the parent could bring to the next check-up, only if they follow naturally from the record. Skip this section if there is nothing to ask.
- Keep the whole answer under about 300 words unless the parent asked a specific question that needs more.
- Close with one short line noting this is general information from the growth chart, not medical advice.`;

interface Row {
  m: GrowthMeasurement; age: number; s: { z: number; percentile: number } | null; w: { z: number; percentile: number } | null; bmi: number | null; off: boolean;
}

function rows(child: GrowthChild, measurements: GrowthMeasurement[]): Row[] {
  return measurements
    .filter((m) => m.child_id === child.id)
    .map((m) => {
      const age = ageInMonths(child.birth_date, m.measured_on);
      return {
        m, age,
        s: m.stature_cm !== null ? assess(child.sex, "stature", age, m.stature_cm) : null,
        w: m.weight_kg !== null ? assess(child.sex, "weight", age, m.weight_kg) : null,
        bmi: m.stature_cm !== null && m.weight_kg !== null ? bmi(m.weight_kg, m.stature_cm) : null,
        off: age < MIN_AGE_MONTHS || age > MAX_AGE_MONTHS,
      };
    })
    .sort((a, b) => a.m.measured_on.localeCompare(b.m.measured_on) || a.m.id - b.m.id);
}

/** Number of printed percentile lines (5, 10, 25, 50, 75, 90, 95) strictly between two percentile values. */
function linesCrossed(from: number, to: number): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return CHART_PERCENTILES.filter((p) => p > lo && p < hi).length;
}

const pct = (a: { percentile: number; z: number } | null) => (a ? `${formatPercentile(a.percentile)} percentile (z ${a.z.toFixed(2)})` : "not on chart");

/** Human-readable facts block plus the list of flags, ready to hand to the model. */
export function growthFacts(child: GrowthChild, measurements: GrowthMeasurement[]): string {
  const all = rows(child, measurements);
  const on = all.filter((r) => !r.off);
  const girl = child.sex === "F";
  const ageNow = ageInMonths(child.birth_date, todayIso());
  const out: string[] = [];
  const flags: string[] = [];

  out.push(`Child: ${child.name}, ${girl ? "girl" : "boy"}, born ${child.birth_date}, ${formatAge(ageNow)} old today (${todayIso()}). Chart: CDC 2000 ${girl ? "girls" : "boys"} 2 to 20 years.`);

  if (child.mother_height_cm && child.father_height_cm) {
    const t = midParentalHeight(child.sex, child.mother_height_cm, child.father_height_cm);
    const tp = assess(child.sex, "stature", MAX_AGE_MONTHS, t.target);
    out.push(`Parents: mother ${child.mother_height_cm} cm, father ${child.father_height_cm} cm. Mid-parental target adult height ${t.target.toFixed(1)} cm (range ${t.low.toFixed(1)} to ${t.high.toFixed(1)} cm)${tp ? `, which sits at about the ${formatPercentile(tp.percentile)} percentile for adults on this chart` : ""}.`);
  }

  out.push("", "Measurements (oldest first):");
  for (const r of all) {
    const parts = [`${r.m.measured_on} (age ${formatAge(r.age)})`];
    if (r.m.stature_cm !== null) parts.push(`stature ${r.m.stature_cm} cm, ${r.off ? "before age 2 so not on this chart" : pct(r.s)}`);
    if (r.m.weight_kg !== null) parts.push(`weight ${r.m.weight_kg} kg, ${r.off ? "before age 2 so not on this chart" : pct(r.w)}`);
    if (r.bmi !== null) parts.push(`BMI ${r.bmi.toFixed(1)}`);
    if (r.m.note) parts.push(`note: "${r.m.note}"`);
    out.push("- " + parts.join("; "));
  }

  const latest = on[on.length - 1];
  if (latest) {
    const ref = (measure: "stature" | "weight") => referenceAt(child.sex, measure, latest.age);
    const rs = ref("stature");
    const rw = ref("weight");
    out.push("", `Reference at the latest measured age (${formatAge(latest.age)}):`);
    if (rs) out.push(`- Stature: 5th ${rs.p5.toFixed(1)} cm, 50th ${rs.p50.toFixed(1)} cm, 95th ${rs.p95.toFixed(1)} cm.`);
    if (rw) out.push(`- Weight: 5th ${rw.p5.toFixed(1)} kg, 50th ${rw.p50.toFixed(1)} kg, 95th ${rw.p95.toFixed(1)} kg.`);
  }

  // Trends, computed only from on-chart points.
  for (const measure of ["stature", "weight"] as const) {
    const pts = on.filter((r) => (measure === "stature" ? r.s : r.w));
    if (pts.length < 2) continue;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const a = (r: Row) => (measure === "stature" ? r.s! : r.w!);
    const crossed = linesCrossed(a(first).percentile, a(last).percentile);
    const dir = a(last).percentile > a(first).percentile ? "up" : "down";
    out.push("", `${measure === "stature" ? "Stature" : "Weight"} trend: ${formatPercentile(a(first).percentile)} percentile at ${formatAge(first.age)} to ${formatPercentile(a(last).percentile)} percentile at ${formatAge(last.age)}; ${crossed === 0 ? "no printed percentile line crossed" : `${crossed} printed percentile line${crossed === 1 ? "" : "s"} crossed, moving ${dir}`}.`);
    if (crossed >= 2) flags.push(`${measure === "stature" ? "Stature" : "Weight"} has crossed ${crossed} printed percentile lines ${dir}ward since ${first.m.measured_on}. Crossing two or more lines is one of the things pediatricians look at.`);

    if (measure === "stature") {
      const prev = pts[pts.length - 2];
      const years = (last.age - prev.age) / 12;
      if (years >= 0.4) {
        const velocity = (last.m.stature_cm! - prev.m.stature_cm!) / years;
        out.push(`Stature velocity over the last interval (${prev.m.measured_on} to ${last.m.measured_on}, ${years.toFixed(1)} years): ${velocity.toFixed(1)} cm per year.`);
        if (velocity < 4 && prev.age >= 36 && last.age <= 120) flags.push(`Stature velocity of ${velocity.toFixed(1)} cm per year over the last interval is on the slow side for this age; roughly 5 to 7 cm per year is typical between ages 3 and 10, though intervals under a year are noisy.`);
      }
      const latestS = a(last).percentile;
      if (latestS < 5) flags.push(`Latest stature is below the 5th percentile line.`);
      if (latestS > 95) flags.push(`Latest stature is above the 95th percentile line.`);
    } else {
      const latestW = a(last).percentile;
      if (latestW < 5) flags.push(`Latest weight is below the 5th percentile line.`);
      if (latestW > 95) flags.push(`Latest weight is above the 95th percentile line.`);
    }
  }

  if (latest && latest.s && latest.w) {
    const gap = latest.w.percentile - latest.s.percentile;
    if (Math.abs(gap) >= 50) flags.push(`At the latest visit the weight percentile (${formatPercentile(latest.w.percentile)}) and stature percentile (${formatPercentile(latest.s.percentile)}) are far apart. Doctors usually look at BMI-for-age in that case, which this chart does not show.`);
  }

  out.push("", flags.length ? "Flags (things commonly worth mentioning to the pediatrician):" : "Flags: none. Nothing in this record meets the usual attention points (no line crossings of two or more, nothing outside the 5th to 95th band, no slow stature velocity).");
  for (const f of flags) out.push("- " + f);
  if (on.length === 1) out.push("", "Only one on-chart measurement exists, so no trend can be described yet.");
  if (on.length === 0) out.push("", "There are no on-chart measurements yet.");
  return out.join("\n");
}
