import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

// DATA_DIR can point at a mounted volume when hosted (e.g. /data on Railway).
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS growth_children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  sex TEXT NOT NULL DEFAULT 'F',
  mother_height_cm REAL,
  father_height_cm REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS growth_measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  measured_on TEXT NOT NULL,
  stature_cm REAL,
  weight_kg REAL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "growth.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

const g = globalThis as unknown as { __growthDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__growthDb) g.__growthDb = open();
  return g.__growthDb;
}

export type Row = Record<string, unknown>;
type Param = string | number | null;

// node:sqlite returns null-prototype objects, which React refuses to pass to client
// components, so every row is copied into a plain object.
const plain = <T,>(row: unknown): T => ({ ...(row as object) }) as T;

export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  return (getDb().prepare(sql).all(...params) as unknown[]).map((r) => plain<T>(r));
}
export function get<T = Row>(sql: string, ...params: Param[]): T | undefined {
  const row = getDb().prepare(sql).get(...params);
  return row === undefined ? undefined : plain<T>(row);
}
export function run(sql: string, ...params: Param[]) {
  return getDb().prepare(sql).run(...params);
}

export function insertRow(table: string, data: Record<string, Param>): number {
  const keys = Object.keys(data);
  const r = run(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, ...keys.map((k) => data[k]));
  return Number(r.lastInsertRowid);
}

export function updateRow(table: string, id: number, data: Record<string, Param>) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => data[k]), id);
}

export interface GrowthChild {
  id: number; name: string; birth_date: string; sex: "F" | "M";
  mother_height_cm: number | null; father_height_cm: number | null; created_at: string;
}
export interface GrowthMeasurement {
  id: number; child_id: number; measured_on: string; stature_cm: number | null; weight_kg: number | null;
  note: string; created_at: string;
}
