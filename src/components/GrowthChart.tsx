"use client";

import { useMemo } from "react";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LabelList } from "recharts";
import {
  CHART_PERCENTILES, CM_PER_IN, KG_PER_LB, MAX_AGE_MONTHS, MIN_AGE_MONTHS, referenceAt, referenceCurves,
  formatAge, formatPercentile, ordinal, type Measure, type Sex, type Units,
} from "@/lib/growth";

export interface ChartPoint {
  id: number;
  ageMonths: number;
  value: number;        // cm or kg
  percentile: number;   // 0..100
  measuredOn: string;
}

interface Props {
  sex: Sex;
  measure: Measure;
  units: Units;
  childName: string;
  points: ChartPoint[];
}

const CHILD = "#0a66c2";        // the one data series (Timbre brand blue)
const REF_STRONG = "#a6a49b";   // 5th, 50th, 95th, like the heavier lines on the printed chart
const REF_LIGHT = "#d3d1c9";    // 10th, 25th, 75th, 90th
const GRID = "#ebeae5";
const MUTED = "#898781";
const STRONG = new Set([5, 50, 95]);

type Row = Record<string, number | undefined> & { age: number; ageMonths: number };

function EndLabel(props: { x?: number; y?: number; index?: number; value?: number; total: number; text: string }) {
  const { x, y, index, total, text } = props;
  if (index !== total - 1 || x === undefined || y === undefined) return null;
  return <text x={x + 5} y={y} dy={3} fontSize={10} fill={MUTED} textAnchor="start">{text}</text>;
}

function Dot(props: { cx?: number; cy?: number; payload?: Row }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || payload?.child === undefined) return null;
  return <circle cx={cx} cy={cy} r={5} fill={CHILD} stroke="#ffffff" strokeWidth={2} />;
}

export default function GrowthChart({ sex, measure, units, childName, points }: Props) {
  const toUnit = (v: number) => (units === "metric" ? v : measure === "stature" ? v / CM_PER_IN : v / KG_PER_LB);
  const unitLabel = measure === "stature" ? (units === "metric" ? "cm" : "in") : units === "metric" ? "kg" : "lb";

  const data = useMemo<Row[]>(() => {
    const rows: Row[] = referenceCurves(sex, measure).map((r) => {
      const row: Row = { age: r.ageMonths / 12, ageMonths: r.ageMonths };
      for (const p of CHART_PERCENTILES) row[`p${p}`] = toUnit(r[`p${p}`]);
      return row;
    });
    for (const pt of points) {
      if (pt.ageMonths < MIN_AGE_MONTHS || pt.ageMonths > MAX_AGE_MONTHS) continue;
      const ref = referenceAt(sex, measure, pt.ageMonths);
      const row: Row = { age: pt.ageMonths / 12, ageMonths: pt.ageMonths, child: toUnit(pt.value), pct: pt.percentile, id: pt.id };
      if (ref) for (const p of CHART_PERCENTILES) row[`p${p}`] = toUnit(ref[`p${p}`]);
      rows.push(row);
    }
    rows.sort((a, b) => a.age - b.age || (a.child === undefined ? -1 : 1));
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sex, measure, units, points]);

  // Y range covers the 5th to 95th curves and every plotted point, snapped to a clean tick step.
  const { yMin, yMax, ticks } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of data) {
      for (const k of ["p5", "p95", "child"]) {
        const v = r[k];
        if (v !== undefined) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
    }
    const step = [1, 2, 5, 10, 20, 25, 50].find((s) => (hi - lo) / s <= 11) ?? 50;
    const min = Math.floor((lo - step * 0.3) / step) * step;
    const max = Math.ceil((hi + step * 0.3) / step) * step;
    const t: number[] = [];
    for (let v = min; v <= max + 1e-9; v += step) t.push(v);
    return { yMin: min, yMax: max, ticks: t };
  }, [data]);

  const lastIndex = data.length;
  const title = measure === "stature" ? "Stature-for-age" : "Weight-for-age";
  const onChart = points.filter((p) => p.ageMonths >= MIN_AGE_MONTHS && p.ageMonths <= MAX_AGE_MONTHS).length;

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h2 className="h2">{title}</h2>
          <div className="muted">CDC 2000, {sex === "F" ? "girls" : "boys"} 2 to 20 years. Percentile lines 5, 10, 25, 50, 75, 90, 95.</div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: CHILD }} /> {childName}</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2" style={{ borderColor: REF_STRONG }} /> CDC percentiles</span>
        </div>
      </div>
      <div style={{ width: "100%", height: 380 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 28, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeWidth={1} />
            <XAxis
              dataKey="age" type="number" domain={[2, 20]} ticks={[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]}
              tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: "#c3c2b7" }}
              label={{ value: "Age (years)", position: "insideBottom", offset: -4, fontSize: 11, fill: MUTED }}
            />
            <YAxis
              type="number" domain={[yMin, yMax]} ticks={ticks} width={56} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false}
              label={{ value: `${title.split("-")[0]} (${unitLabel})`, angle: -90, position: "insideLeft", offset: 12, fontSize: 11, fill: MUTED, style: { textAnchor: "middle" } }}
            />
            <Tooltip
              cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Row;
                const fmt = (v: number | undefined) => (v === undefined ? "" : `${v.toFixed(1)} ${unitLabel}`);
                return (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
                    <div className="font-semibold mb-1">Age {formatAge(row.ageMonths)}</div>
                    {row.child !== undefined && (
                      <div className="mb-1">{childName}: <b>{fmt(row.child)}</b> ({formatPercentile(row.pct ?? 0)} percentile)</div>
                    )}
                    <div className="text-muted">50th: {fmt(row.p50)} · 5th: {fmt(row.p5)} · 95th: {fmt(row.p95)}</div>
                  </div>
                );
              }}
            />
            {CHART_PERCENTILES.map((p) => (
              <Line
                key={p} dataKey={`p${p}`} type="monotone" dot={false} activeDot={false} isAnimationActive={false} connectNulls
                stroke={STRONG.has(p) ? REF_STRONG : REF_LIGHT} strokeWidth={STRONG.has(p) ? 1.5 : 1}
              >
                <LabelList dataKey={`p${p}`} content={(lp) => <EndLabel {...(lp as { x?: number; y?: number; index?: number })} total={lastIndex} text={String(p)} />} />
              </Line>
            ))}
            <Line dataKey="child" type="linear" stroke={CHILD} strokeWidth={2} connectNulls isAnimationActive={false} dot={<Dot />} activeDot={{ r: 7, fill: CHILD, stroke: "#ffffff", strokeWidth: 2 }} />
            {points.length === 0 && <ReferenceLine x={11} stroke="none" label={{ value: "Add a measurement to plot it here", fill: MUTED, fontSize: 12 }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {onChart < points.length && (
        <div className="muted mt-2">{points.length - onChart} measurement{points.length - onChart === 1 ? " is" : "s are"} outside 2 to 20 years and not plotted.</div>
      )}
      <div className="sr-only">{points.map((p) => `${p.measuredOn}: ${p.value} ${measure === "stature" ? "cm" : "kg"}, ${ordinal(Math.round(p.percentile))} percentile`).join("; ")}</div>
    </div>
  );
}
