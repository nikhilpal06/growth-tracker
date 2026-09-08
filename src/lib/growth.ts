// Growth-chart arithmetic shared by the server routes and the /growth page.
// Everything here is derived from the CDC 2000 LMS tables in growth-data.ts, which are the
// same curves printed on the "2 to 20 years: Stature-for-age and Weight-for-age percentiles" charts.

import { CDC_BOYS_STATURE, CDC_BOYS_WEIGHT, CDC_GIRLS_STATURE, CDC_GIRLS_WEIGHT, type LmsRow } from "./growth-data";

export type Sex = "F" | "M";
export type Measure = "stature" | "weight";
export interface Lms { L: number; M: number; S: number }

/** Percentile lines printed on the CDC chart. */
export const CHART_PERCENTILES = [5, 10, 25, 50, 75, 90, 95] as const;
export const MIN_AGE_MONTHS = 24;
export const MAX_AGE_MONTHS = 240;
/** CDC's month length: age in months = days / 30.4375. */
const DAYS_PER_MONTH = 30.4375;
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function referenceTable(sex: Sex, measure: Measure): readonly LmsRow[] {
  if (sex === "F") return measure === "stature" ? CDC_GIRLS_STATURE : CDC_GIRLS_WEIGHT;
  return measure === "stature" ? CDC_BOYS_STATURE : CDC_BOYS_WEIGHT;
}

/** L, M, S at an exact age, linearly interpolated between grid rows. Null outside 24 to 240 months. */
export function lmsAt(table: readonly LmsRow[], ageMonths: number): Lms | null {
  if (!Number.isFinite(ageMonths) || ageMonths < table[0][0] || ageMonths > table[table.length - 1][0]) return null;
  let lo = 0;
  let hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid][0] <= ageMonths) lo = mid; else hi = mid;
  }
  const a = table[lo];
  const b = table[hi];
  if (ageMonths === a[0] || a === b) return { L: a[1], M: a[2], S: a[3] };
  const t = (ageMonths - a[0]) / (b[0] - a[0]);
  return { L: a[1] + t * (b[1] - a[1]), M: a[2] + t * (b[2] - a[2]), S: a[3] + t * (b[3] - a[3]) };
}

/** Box-Cox z-score of a measurement given L, M, S (the CDC formula). */
export function zFromValue(x: number, { L, M, S }: Lms): number {
  if (Math.abs(L) < 1e-9) return Math.log(x / M) / S;
  return (Math.pow(x / M, L) - 1) / (L * S);
}

/** Inverse of zFromValue: the measurement that sits at z standard deviations. */
export function valueFromZ(z: number, { L, M, S }: Lms): number {
  if (Math.abs(L) < 1e-9) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, absolute error below 1.5e-7). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Inverse standard normal CDF (Acklam's rational approximation, relative error about 1e-9). */
export function normalInv(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError("p must be in (0, 1)");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface Assessment { z: number; percentile: number }

/** Where a measurement falls against the CDC reference. Null when the age is off the chart. */
export function assess(sex: Sex, measure: Measure, ageMonths: number, value: number): Assessment | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const lms = lmsAt(referenceTable(sex, measure), ageMonths);
  if (!lms) return null;
  const z = zFromValue(value, lms);
  return { z, percentile: 100 * normalCdf(z) };
}

/** The reference curves for the chart, one row per grid age with a value per percentile. */
export function referenceCurves(sex: Sex, measure: Measure, percentiles: readonly number[] = CHART_PERCENTILES) {
  const zs = percentiles.map((p) => normalInv(p / 100));
  return referenceTable(sex, measure).map((row) => {
    const lms = { L: row[1], M: row[2], S: row[3] };
    const out: Record<string, number> = { ageMonths: row[0] };
    percentiles.forEach((p, i) => { out[`p${p}`] = valueFromZ(zs[i], lms); });
    return out;
  });
}

/** Percentile values at one exact age (used to draw the child's point on a dense row). */
export function referenceAt(sex: Sex, measure: Measure, ageMonths: number, percentiles: readonly number[] = CHART_PERCENTILES): Record<string, number> | null {
  const lms = lmsAt(referenceTable(sex, measure), ageMonths);
  if (!lms) return null;
  const out: Record<string, number> = {};
  for (const p of percentiles) out[`p${p}`] = valueFromZ(normalInv(p / 100), lms);
  return out;
}

// ---------- Dates and ages ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses YYYY-MM-DD as a UTC day number; null if malformed or not a real calendar date. */
export function parseIsoDate(s: string): number | null {
  if (!ISO_DATE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return t;
}

/** Today's date in the browser's (or server's) local time zone as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Age in decimal months between two YYYY-MM-DD dates, using the CDC convention of 30.4375 days per month. */
export function ageInMonths(birthDate: string, onDate: string): number {
  const b = parseIsoDate(birthDate);
  const o = parseIsoDate(onDate);
  if (b === null || o === null) return NaN;
  return (o - b) / 864e5 / DAYS_PER_MONTH;
}

/** "4 y 3 m" style age label. */
export function formatAge(ageMonths: number): string {
  if (!Number.isFinite(ageMonths)) return "";
  const whole = Math.floor(ageMonths + 1e-9);
  const y = Math.floor(whole / 12);
  const m = whole % 12;
  if (y === 0) return `${m} m`;
  return m ? `${y} y ${m} m` : `${y} y`;
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** "37th", "<1st", ">99th". */
export function formatPercentile(p: number): string {
  if (p < 1) return "<1st";
  if (p > 99) return ">99th";
  return ordinal(Math.round(p));
}

// ---------- Derived numbers ----------

export function bmi(weightKg: number, statureCm: number): number {
  return weightKg / Math.pow(statureCm / 100, 2);
}

/**
 * Mid-parental (target) adult height, the standard use of the "Mother's / Father's stature" boxes on the chart.
 * Girls: (father - 13 + mother) / 2; boys: (father + mother + 13) / 2; either way give or take about 8.5 cm.
 */
export function midParentalHeight(sex: Sex, motherCm: number, fatherCm: number) {
  const target = sex === "F" ? (fatherCm - 13 + motherCm) / 2 : (fatherCm + motherCm + 13) / 2;
  return { target, low: target - 8.5, high: target + 8.5 };
}

// ---------- Units ----------

export type Units = "metric" | "imperial";

export function displayLength(cm: number, units: Units): string {
  if (units === "metric") return `${cm.toFixed(1)} cm`;
  const totalIn = cm / CM_PER_IN;
  return `${totalIn.toFixed(1)} in`;
}

export function displayWeight(kg: number, units: Units): string {
  return units === "metric" ? `${kg.toFixed(1)} kg` : `${(kg / KG_PER_LB).toFixed(1)} lb`;
}

/** Feet-and-inches form for statures, e.g. 4' 3.5". */
export function feetInches(cm: number): string {
  const totalIn = cm / CM_PER_IN;
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn - ft * 12;
  return `${ft}' ${inch.toFixed(1)}"`;
}
