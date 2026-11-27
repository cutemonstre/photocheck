import { STATUSES, type Status } from "./types.js";

export type Expected = Status | Status[];
export interface Label {
  expected: Expected;
  note?: string;
}
export type Labels = Record<string, Label>;

export interface EvalRow {
  file: string;
  expected: Status[];
  actual: Status;
}

export interface VersionScore {
  total: number;
  correct: number;
  accuracy: number;
  /** confusion[expectedStatus][actualStatus] = count. Hits count on the diagonal. */
  confusion: Record<string, Record<string, number>>;
  misses: EvalRow[];
}

export function expectedList(e: Expected): Status[] {
  return Array.isArray(e) ? e : [e];
}

export function isHit(row: EvalRow): boolean {
  return row.expected.includes(row.actual);
}

/**
 * Accuracy is hits over all photos. A photo with several acceptable statuses is a hit on any of them.
 * In the confusion table a hit is filed under the status it got, and a miss under the first expected status.
 */
export function scoreRows(rows: readonly EvalRow[]): VersionScore {
  const confusion: Record<string, Record<string, number>> = {};
  for (const s of STATUSES) confusion[s] = Object.fromEntries(STATUSES.map((t) => [t, 0]));
  const misses: EvalRow[] = [];
  let correct = 0;
  for (const row of rows) {
    const hit = isHit(row);
    const rowKey = hit ? row.actual : (row.expected[0] ?? row.actual);
    const line = confusion[rowKey] ?? (confusion[rowKey] = {});
    line[row.actual] = (line[row.actual] ?? 0) + 1;
    if (hit) correct++;
    else misses.push(row);
  }
  const total = rows.length;
  return { total, correct, accuracy: total === 0 ? 0 : correct / total, confusion, misses };
}

export interface StatusChange {
  file: string;
  statuses: Record<number, Status>;
}

/** Photos whose status is not the same in every version. */
export function statusChanges(byVersion: Record<number, Record<string, Status>>): StatusChange[] {
  const versions = Object.keys(byVersion).map(Number);
  const files = new Set<string>();
  for (const v of versions) for (const f of Object.keys(byVersion[v] ?? {})) files.add(f);
  const out: StatusChange[] = [];
  for (const file of [...files].sort()) {
    const statuses: Record<number, Status> = {};
    for (const v of versions) {
      const s = byVersion[v]?.[file];
      if (s) statuses[v] = s;
    }
    if (new Set(Object.values(statuses)).size > 1) out.push({ file, statuses });
  }
  return out;
}
