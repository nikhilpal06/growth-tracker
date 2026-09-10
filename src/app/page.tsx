"use client";

import { useEffect, useMemo, useState } from "react";
import type { GrowthChild, GrowthMeasurement } from "@/lib/db";
import { api } from "@/lib/client";
import { PageHeader, Spinner, useFlash } from "@/components/ui";
import GrowthChart, { type ChartPoint } from "@/components/GrowthChart";
import Markdown from "@/components/Markdown";
import {
  CM_PER_IN, KG_PER_LB, MAX_AGE_MONTHS, MIN_AGE_MONTHS, ageInMonths, assess, bmi, displayLength, displayWeight, feetInches,
  formatAge, formatPercentile, midParentalHeight, todayIso, type Sex, type Units,
} from "@/lib/growth";
import { Plus, Pencil, Trash2, Save, X, Download, UserRoundPlus, Sparkles, Square } from "lucide-react";

interface Data { children: GrowthChild[]; measurements: GrowthMeasurement[]; ai: boolean; model: string }

const UNITS_KEY = "growth:units";
const CHILD_KEY = "growth:child";

const emptyChild = { name: "", birth_date: "", sex: "F" as Sex, mother_height: "", father_height: "" };
const emptyMeasure = () => ({ measured_on: todayIso(), stature: "", weight: "", note: "" });

const round1 = (n: number) => Math.round(n * 10) / 10;
const toCm = (s: string, units: Units) => (s.trim() === "" ? "" : units === "metric" ? Number(s) : Number(s) * CM_PER_IN);
const toKg = (s: string, units: Units) => (s.trim() === "" ? "" : units === "metric" ? Number(s) : Number(s) * KG_PER_LB);
const fromCm = (cm: number | null, units: Units) => (cm === null ? "" : String(round1(units === "metric" ? cm : cm / CM_PER_IN)));
const fromKg = (kg: number | null, units: Units) => (kg === null ? "" : String(round1(units === "metric" ? kg : kg / KG_PER_LB)));

export default function GrowthPage() {
  const [data, setData] = useState<Data | null>(null);
  const [childId, setChildId] = useState<number | null>(null);
  const [units, setUnits] = useState<Units>("metric");
  const [childForm, setChildForm] = useState<typeof emptyChild | null>(null);
  const [editingChild, setEditingChild] = useState<number | null>(null);
  const [mForm, setMForm] = useState(emptyMeasure);
  const [editingM, setEditingM] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [explanation, setExplanation] = useState("");
  const [explaining, setExplaining] = useState<AbortController | null>(null);
  const { flash, node } = useFlash();

  useEffect(() => {
    api<Data>("/api/growth").then((d) => {
      setData(d);
      // Per-browser preferences; read after the fetch so the first client render matches the server one.
      let remembered: number | null = null;
      try {
        const u = localStorage.getItem(UNITS_KEY);
        if (u === "imperial" || u === "metric") setUnits(u);
        remembered = Number(localStorage.getItem(CHILD_KEY)) || null;
      } catch { /* ignore */ }
      const first = d.children.find((c) => c.id === remembered) ?? d.children[0];
      setChildId(first?.id ?? null);
      if (!d.children.length) setChildForm({ ...emptyChild });
    }).catch((e) => flash(e instanceof Error ? e.message : String(e), "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const child = data?.children.find((c) => c.id === childId) ?? null;
  const rows = useMemo(() => {
    if (!child || !data) return [];
    return data.measurements
      .filter((m) => m.child_id === child.id)
      .map((m) => {
        const age = ageInMonths(child.birth_date, m.measured_on);
        const stature = m.stature_cm !== null ? assess(child.sex, "stature", age, m.stature_cm) : null;
        const weight = m.weight_kg !== null ? assess(child.sex, "weight", age, m.weight_kg) : null;
        const b = m.stature_cm !== null && m.weight_kg !== null ? bmi(m.weight_kg, m.stature_cm) : null;
        return { m, age, stature, weight, bmi: b, offChart: age < MIN_AGE_MONTHS || age > MAX_AGE_MONTHS };
      });
  }, [child, data]);

  const points = (measure: "stature" | "weight"): ChartPoint[] =>
    rows.flatMap((r) => {
      const value = measure === "stature" ? r.m.stature_cm : r.m.weight_kg;
      const a = measure === "stature" ? r.stature : r.weight;
      if (value === null) return [];
      return [{ id: r.m.id, ageMonths: r.age, value, percentile: a?.percentile ?? NaN, measuredOn: r.m.measured_on }];
    });

  const latest = (measure: "stature" | "weight") => [...rows].reverse().find((r) => (measure === "stature" ? r.m.stature_cm : r.m.weight_kg) !== null) ?? null;
  const latestS = latest("stature");
  const latestW = latest("weight");
  const latestBmi = [...rows].reverse().find((r) => r.bmi !== null) ?? null;
  const ageToday = child ? ageInMonths(child.birth_date, todayIso()) : NaN;
  const target = child && child.mother_height_cm && child.father_height_cm ? midParentalHeight(child.sex, child.mother_height_cm, child.father_height_cm) : null;

  function chooseUnits(u: Units) {
    setUnits(u);
    try { localStorage.setItem(UNITS_KEY, u); } catch { /* ignore */ }
  }
  function chooseChild(id: number) {
    setChildId(id);
    setEditingM(null); setMForm(emptyMeasure()); setExplanation(""); setQuestion("");
    try { localStorage.setItem(CHILD_KEY, String(id)); } catch { /* ignore */ }
  }

  function startEditChild(c: GrowthChild) {
    setEditingChild(c.id);
    setChildForm({ name: c.name, birth_date: c.birth_date, sex: c.sex, mother_height: fromCm(c.mother_height_cm, units), father_height: fromCm(c.father_height_cm, units) });
  }

  async function saveChild() {
    if (!childForm) return;
    setBusy(true);
    try {
      const json = {
        name: childForm.name, birth_date: childForm.birth_date, sex: childForm.sex,
        mother_height_cm: toCm(childForm.mother_height, units), father_height_cm: toCm(childForm.father_height, units),
      };
      if (editingChild) {
        const updated = await api<GrowthChild>(`/api/growth/children/${editingChild}`, { method: "PATCH", json });
        setData((d) => d && { ...d, children: d.children.map((c) => (c.id === updated.id ? updated : c)) });
      } else {
        const created = await api<GrowthChild>("/api/growth/children", { method: "POST", json });
        setData((d) => d && { ...d, children: [...d.children, created] });
        chooseChild(created.id);
      }
      setChildForm(null); setEditingChild(null);
      flash("Saved");
    } catch (e) { flash(e instanceof Error ? e.message : String(e), "error"); }
    finally { setBusy(false); }
  }

  async function removeChild(c: GrowthChild) {
    const n = data?.measurements.filter((m) => m.child_id === c.id).length ?? 0;
    if (!confirm(`Delete ${c.name} and ${n} measurement${n === 1 ? "" : "s"}? This cannot be undone.`)) return;
    await api(`/api/growth/children/${c.id}`, { method: "DELETE" });
    setData((d) => d && { ...d, children: d.children.filter((x) => x.id !== c.id), measurements: d.measurements.filter((m) => m.child_id !== c.id) });
    const next = data?.children.find((x) => x.id !== c.id);
    if (next) chooseChild(next.id); else { setChildId(null); setChildForm({ ...emptyChild }); }
  }

  function startEditMeasurement(m: GrowthMeasurement) {
    setEditingM(m.id);
    setMForm({ measured_on: m.measured_on, stature: fromCm(m.stature_cm, units), weight: fromKg(m.weight_kg, units), note: m.note });
    document.getElementById("measure-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveMeasurement() {
    if (!child) return;
    setBusy(true);
    try {
      const json = { child_id: child.id, measured_on: mForm.measured_on, stature_cm: toCm(mForm.stature, units), weight_kg: toKg(mForm.weight, units), note: mForm.note };
      if (editingM) {
        const updated = await api<GrowthMeasurement>(`/api/growth/measurements/${editingM}`, { method: "PATCH", json });
        setData((d) => d && { ...d, measurements: d.measurements.map((m) => (m.id === updated.id ? updated : m)) });
      } else {
        const created = await api<GrowthMeasurement>("/api/growth/measurements", { method: "POST", json });
        setData((d) => d && { ...d, measurements: [...d.measurements, created] });
      }
      setData((d) => d && { ...d, measurements: [...d.measurements].sort((a, b) => a.measured_on.localeCompare(b.measured_on) || a.id - b.id) });
      setEditingM(null); setMForm(emptyMeasure());
      flash(editingM ? "Measurement updated" : "Measurement added");
    } catch (e) { flash(e instanceof Error ? e.message : String(e), "error"); }
    finally { setBusy(false); }
  }

  async function removeMeasurement(m: GrowthMeasurement) {
    if (!confirm(`Delete the measurement from ${m.measured_on}?`)) return;
    await api(`/api/growth/measurements/${m.id}`, { method: "DELETE" });
    setData((d) => d && { ...d, measurements: d.measurements.filter((x) => x.id !== m.id) });
    if (editingM === m.id) { setEditingM(null); setMForm(emptyMeasure()); }
  }

  async function explain() {
    if (!child) return;
    explaining?.abort();
    const ctrl = new AbortController();
    setExplaining(ctrl); setExplanation("");
    try {
      const res = await fetch("/api/growth/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ child_id: child.id, question }), signal: ctrl.signal });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as { error?: string }).error ?? `Request failed (${res.status})`); }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setExplanation(acc);
      }
      acc += dec.decode();
      const i = acc.indexOf("[AI error]");
      if (i >= 0) { setExplanation(acc.slice(0, i).trim()); flash(acc.slice(i + 10).trim(), "error"); } else setExplanation(acc);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) flash(e instanceof Error ? e.message : String(e), "error");
    } finally { setExplaining(null); }
  }

  function exportCsv() {
    if (!child) return;
    const head = ["date", "age_months", "stature_cm", "stature_percentile", "stature_z", "weight_kg", "weight_percentile", "weight_z", "bmi", "note"];
    const lines = rows.map((r) => [
      r.m.measured_on, r.age.toFixed(2), r.m.stature_cm ?? "", r.stature ? r.stature.percentile.toFixed(1) : "", r.stature ? r.stature.z.toFixed(2) : "",
      r.m.weight_kg ?? "", r.weight ? r.weight.percentile.toFixed(1) : "", r.weight ? r.weight.z.toFixed(2) : "", r.bmi ? r.bmi.toFixed(1) : "",
      `"${r.m.note.replace(/"/g, '""')}"`,
    ].join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${child.name.replace(/[^\w-]+/g, "_")}-growth.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const lenUnit = units === "metric" ? "cm" : "in";
  const wtUnit = units === "metric" ? "kg" : "lb";
  const pct = (a: { percentile: number } | null, offChart: boolean) => (offChart ? <span className="text-muted" title="Outside the 2 to 20 year chart">off chart</span> : a ? formatPercentile(a.percentile) : "");

  if (!data) return <div className="muted flex items-center gap-2"><Spinner /> Loading...</div>;

  return (
    <div>
      <PageHeader
        title="Growth"
        subtitle="Stature-for-age and weight-for-age against the CDC 2000 charts for 2 to 20 years."
        right={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-xs font-semibold">
              {(["metric", "imperial"] as Units[]).map((u) => (
                <button key={u} type="button" onClick={() => chooseUnits(u)} className={`px-3 h-7 rounded-full ${units === u ? "bg-brand text-white" : "text-muted hover:text-ink"}`}>
                  {u === "metric" ? "cm / kg" : "in / lb"}
                </button>
              ))}
            </div>
            {child && !childForm && <button className="btn-secondary btn-sm" onClick={() => { setEditingChild(null); setChildForm({ ...emptyChild }); }}><UserRoundPlus size={14} /> Add child</button>}
          </div>
        }
      />
      <div className="space-y-3 mb-4">{node}</div>

      {childForm && (
        <div className="card card-pad mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="h2">{editingChild ? "Edit child" : data.children.length ? "Add a child" : "Who are we tracking?"}</h2>
            {(data.children.length > 0) && <button className="btn-ghost btn-sm" onClick={() => { setChildForm(null); setEditingChild(null); }}><X size={14} /> Cancel</button>}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-1"><label className="label">Name</label><input className="input" value={childForm.name} onChange={(e) => setChildForm({ ...childForm, name: e.target.value })} placeholder="First name" /></div>
            <div><label className="label">Birth date</label><input className="input" type="date" max={todayIso()} value={childForm.birth_date} onChange={(e) => setChildForm({ ...childForm, birth_date: e.target.value })} /></div>
            <div>
              <label className="label">Chart</label>
              <select className="input" value={childForm.sex} onChange={(e) => setChildForm({ ...childForm, sex: e.target.value as Sex })}>
                <option value="F">Girls</option>
                <option value="M">Boys</option>
              </select>
            </div>
            <div><label className="label">Mother&apos;s height ({lenUnit})</label><input className="input" inputMode="decimal" value={childForm.mother_height} onChange={(e) => setChildForm({ ...childForm, mother_height: e.target.value })} placeholder="optional" /></div>
            <div><label className="label">Father&apos;s height ({lenUnit})</label><input className="input" inputMode="decimal" value={childForm.father_height} onChange={(e) => setChildForm({ ...childForm, father_height: e.target.value })} placeholder="optional" /></div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button className="btn-primary" disabled={busy || !childForm.name.trim() || !childForm.birth_date} onClick={saveChild}>{busy ? <Spinner /> : <Save size={16} />} {editingChild ? "Save changes" : "Start tracking"}</button>
            <span className="muted">Parents&apos; heights are optional; they give a mid-parental target height, like the boxes on the paper chart.</span>
          </div>
        </div>
      )}

      {child && (
        <>
          <div className="card card-pad mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            {data.children.length > 1 ? (
              <select className="input w-auto" value={child.id} onChange={(e) => chooseChild(Number(e.target.value))}>
                {data.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div className="text-lg font-semibold">{child.name}</div>
            )}
            <div className="muted">Born {child.birth_date} · {child.sex === "F" ? "girls" : "boys"} chart · {formatAge(ageToday)} old</div>
            {target && (
              <div className="muted" title="Mid-parental height: girls (father − 13 cm + mother) ÷ 2, boys (father + mother + 13 cm) ÷ 2, give or take 8.5 cm">
                Mid-parental target height {displayLength(target.target, units)}{units === "imperial" ? ` (${feetInches(target.target)})` : ""}, range {displayLength(target.low, units)} to {displayLength(target.high, units)}
              </div>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button className="btn-ghost btn-sm" onClick={() => startEditChild(child)}><Pencil size={14} /> Edit</button>
              <button className="btn-danger btn-sm" onClick={() => removeChild(child)}><Trash2 size={14} /> Delete</button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Tile label="Stature" value={latestS?.m.stature_cm != null ? displayLength(latestS.m.stature_cm, units) : "–"} sub={latestS ? (latestS.offChart ? `${latestS.m.measured_on} · off chart` : latestS.stature ? `${formatPercentile(latestS.stature.percentile)} percentile · z ${latestS.stature.z.toFixed(2)}` : "") : "no measurement yet"} />
            <Tile label="Weight" value={latestW?.m.weight_kg != null ? displayWeight(latestW.m.weight_kg, units) : "–"} sub={latestW ? (latestW.offChart ? `${latestW.m.measured_on} · off chart` : latestW.weight ? `${formatPercentile(latestW.weight.percentile)} percentile · z ${latestW.weight.z.toFixed(2)}` : "") : "no measurement yet"} />
            <Tile label="BMI" value={latestBmi?.bmi ? latestBmi.bmi.toFixed(1) : "–"} sub={latestBmi ? `${latestBmi.m.measured_on} · weight ÷ stature²` : "needs both on one date"} />
            <Tile label="Measurements" value={String(rows.length)} sub={rows.length ? `latest ${rows[rows.length - 1].m.measured_on}` : "add the first one below"} />
          </div>

          <div id="measure-form" className="card card-pad mb-6">
            <h2 className="h2 mb-3">{editingM ? "Edit measurement" : "Add a measurement"}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-[180px_1fr_1fr_2fr]">
              <div className="col-span-2 lg:col-span-1"><label className="label">Date</label><input className="input" type="date" min={child.birth_date} max={todayIso()} value={mForm.measured_on} onChange={(e) => setMForm({ ...mForm, measured_on: e.target.value })} /></div>
              <div><label className="label">Stature ({lenUnit})</label><input className="input" inputMode="decimal" placeholder={units === "metric" ? "e.g. 104.5" : "e.g. 41.1"} value={mForm.stature} onChange={(e) => setMForm({ ...mForm, stature: e.target.value })} /></div>
              <div><label className="label">Weight ({wtUnit})</label><input className="input" inputMode="decimal" placeholder={units === "metric" ? "e.g. 17.2" : "e.g. 37.9"} value={mForm.weight} onChange={(e) => setMForm({ ...mForm, weight: e.target.value })} /></div>
              <div className="col-span-2 lg:col-span-1"><label className="label">Note</label><input className="input" placeholder="e.g. 4-year check-up, shoes off" value={mForm.note} onChange={(e) => setMForm({ ...mForm, note: e.target.value })} /></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={busy || !mForm.measured_on || (!mForm.stature.trim() && !mForm.weight.trim())} onClick={saveMeasurement}>{busy ? <Spinner /> : editingM ? <Save size={16} /> : <Plus size={16} />} {editingM ? "Save changes" : "Add"}</button>
              {editingM && <button className="btn-ghost" onClick={() => { setEditingM(null); setMForm(emptyMeasure()); }}><X size={16} /> Cancel</button>}
              <span className="muted">Measure standing height without shoes. Either value can be left blank.</span>
            </div>
          </div>

          <div className="card card-pad mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="h2 flex items-center gap-2"><Sparkles size={18} className="text-brand" /> What do these numbers mean?</h2>
                <p className="muted mt-1">Claude reads {child.name}&apos;s record, the percentiles, and the trend, and explains them in plain language. General information, not medical advice.</p>
              </div>
            </div>
            {data.ai ? (
              <>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input className="input flex-1" placeholder="Optional: ask something specific, e.g. Is she growing at a normal pace?" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !explaining) explain(); }} maxLength={1000} />
                  {explaining ? (
                    <button className="btn-secondary" onClick={() => explaining.abort()}><Square size={14} /> Stop</button>
                  ) : (
                    <button className="btn-primary" disabled={rows.length === 0} onClick={explain}><Sparkles size={16} /> {question.trim() ? "Ask" : "Explain"}</button>
                  )}
                </div>
                {rows.length === 0 && <div className="muted mt-2">Add a measurement first.</div>}
                {(explanation || explaining) && (
                  <div className="mt-4 rounded-lg bg-canvas border border-line p-4">
                    {explanation ? <Markdown text={explanation} /> : <div className="muted flex items-center gap-2"><Spinner /> Reading the record...</div>}
                    {explanation && !explaining && <div className="text-xs text-muted mt-3">Written by Claude ({data.model}) from the CDC percentiles above. Talk to your pediatrician about anything that worries you.</div>}
                  </div>
                )}
              </>
            ) : (
              <div className="muted mt-3">Not enabled yet. Add an <code>ANTHROPIC_API_KEY</code> variable to the Railway service (or your local environment) and redeploy. See the README.</div>
            )}
          </div>

          <div className="space-y-6 mb-6">
            <GrowthChart sex={child.sex} measure="stature" units={units} childName={child.name} points={points("stature")} />
            <GrowthChart sex={child.sex} measure="weight" units={units} childName={child.name} points={points("weight")} />
          </div>

          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="h2">Record</h2>
              <button className="btn-ghost btn-sm" disabled={!rows.length} onClick={exportCsv}><Download size={14} /> Export CSV</button>
            </div>
            {rows.length === 0 ? (
              <div className="px-5 py-10 text-center muted">No measurements yet. Add the first one above.</div>
            ) : (
              <>
              <ul className="md:hidden divide-y divide-line">
                {[...rows].reverse().map((r) => (
                  <li key={r.m.id} className={`px-4 py-3 ${editingM === r.m.id ? "bg-brand-light/40" : ""}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{r.m.measured_on} <span className="font-normal text-muted">· {formatAge(r.age)}</span></div>
                      <div className="flex items-center -mr-2">
                        <button className="btn-ghost btn-sm" onClick={() => startEditMeasurement(r.m)} aria-label="Edit"><Pencil size={15} /></button>
                        <button className="btn-danger btn-sm" onClick={() => removeMeasurement(r.m)} aria-label="Delete"><Trash2 size={15} /></button>
                      </div>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
                      <div><div className="text-[11px] uppercase tracking-wide text-muted">Stature</div><div>{r.m.stature_cm !== null ? displayLength(r.m.stature_cm, units) : "–"}</div><div className="text-xs text-muted">{r.m.stature_cm !== null ? pct(r.stature, r.offChart) : ""}</div></div>
                      <div><div className="text-[11px] uppercase tracking-wide text-muted">Weight</div><div>{r.m.weight_kg !== null ? displayWeight(r.m.weight_kg, units) : "–"}</div><div className="text-xs text-muted">{r.m.weight_kg !== null ? pct(r.weight, r.offChart) : ""}</div></div>
                      <div><div className="text-[11px] uppercase tracking-wide text-muted">BMI</div><div>{r.bmi ? r.bmi.toFixed(1) : "–"}</div></div>
                    </div>
                    {r.m.note && <div className="mt-1 text-xs text-muted">{r.m.note}</div>}
                  </li>
                ))}
              </ul>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-5 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Age</th>
                      <th className="px-3 py-2 font-semibold">Stature</th>
                      <th className="px-3 py-2 font-semibold">Percentile</th>
                      <th className="px-3 py-2 font-semibold">Weight</th>
                      <th className="px-3 py-2 font-semibold">Percentile</th>
                      <th className="px-3 py-2 font-semibold">BMI</th>
                      <th className="px-3 py-2 font-semibold">Note</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].reverse().map((r) => (
                      <tr key={r.m.id} className={`border-t border-line ${editingM === r.m.id ? "bg-brand-light/40" : ""}`}>
                        <td className="px-5 py-2 whitespace-nowrap">{r.m.measured_on}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatAge(r.age)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.m.stature_cm !== null ? displayLength(r.m.stature_cm, units) : ""}</td>
                        <td className="px-3 py-2 whitespace-nowrap" title={r.stature ? `z ${r.stature.z.toFixed(2)}` : undefined}>{r.m.stature_cm !== null ? pct(r.stature, r.offChart) : ""}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.m.weight_kg !== null ? displayWeight(r.m.weight_kg, units) : ""}</td>
                        <td className="px-3 py-2 whitespace-nowrap" title={r.weight ? `z ${r.weight.z.toFixed(2)}` : undefined}>{r.m.weight_kg !== null ? pct(r.weight, r.offChart) : ""}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.bmi ? r.bmi.toFixed(1) : ""}</td>
                        <td className="px-3 py-2 text-muted max-w-[240px] truncate" title={r.m.note}>{r.m.note}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          <button className="btn-ghost btn-sm" onClick={() => startEditMeasurement(r.m)} aria-label="Edit"><Pencil size={14} /></button>
                          <button className="btn-danger btn-sm" onClick={() => removeMeasurement(r.m)} aria-label="Delete"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

          <p className="muted mt-6">
            Percentiles compare your child with U.S. children of the same age and sex on the CDC 2000 growth reference (the curves on the printed chart).
            They describe where a measurement sits, not whether it is healthy. One point matters less than the trend; talk to your pediatrician about anything that worries you.
          </p>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card card-pad">
      <div className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}
