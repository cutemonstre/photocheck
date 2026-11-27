import { toCsv } from "../core/csv.js";
import { estimateCost } from "../core/questions.js";
import { STATUSES, type Scores, type Status } from "../core/types.js";

export interface ScanRow {
  file: string;
  status: Status;
  scores?: Scores;
  /** Time the Clef call took, in milliseconds (includes retries). */
  ms?: number;
  error?: string;
}

const p = (n: number | undefined) => (n === undefined ? "-" : n.toFixed(2));

export function formatLine(row: ScanRow): string {
  const s = row.scores;
  const detail = s
    ? `real=${p(s.real)} face=${p(s.face)} whole=${p(s.wholeFace)} multi=${p(s.multiplePeople)} subject=${s.subject}(${p(s.subjectConfidence)})`
    : (row.error ?? "");
  return `${row.status.padEnd(14)} ${row.file}  ${detail}`;
}

export interface Summary {
  total: number;
  counts: Record<Status, number>;
  inputTokens: number;
  estimatedCostUsd: number;
  /** Median Clef call time in milliseconds, or null if nothing was checked. */
  medianMs: number | null;
}

export function summarise(rows: readonly ScanRow[]): Summary {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  let inputTokens = 0;
  for (const r of rows) {
    counts[r.status]++;
    inputTokens += r.scores?.inputTokens ?? 0;
  }
  const times = rows.flatMap((r) => (r.ms === undefined ? [] : [r.ms])).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const medianMs = times.length === 0 ? null : times.length % 2 ? times[mid]! : Math.round((times[mid - 1]! + times[mid]!) / 2);
  return { total: rows.length, counts, inputTokens, estimatedCostUsd: estimateCost(inputTokens), medianMs };
}

export function formatSummary(s: Summary): string {
  const lines = ["", `Checked ${s.total} photos`];
  for (const st of STATUSES) lines.push(`  ${st.padEnd(14)} ${s.counts[st]}`);
  lines.push(`Input tokens: ${s.inputTokens}`, `Estimated cost: $${s.estimatedCostUsd.toFixed(4)} at $0.24 per million tokens`);
  if (s.medianMs !== null) lines.push(`Median time per photo: ${(s.medianMs / 1000).toFixed(2)} s`);
  return lines.join("\n");
}

export const CSV_COLUMNS = [
  "file",
  "status",
  "real",
  "face",
  "whole_face",
  "multiple_people",
  "subject",
  "subject_confidence",
  "questions_version",
  "input_tokens",
  "latency_ms",
  "error",
] as const;

export function rowsToCsv(rows: readonly ScanRow[]): string {
  return toCsv(
    CSV_COLUMNS,
    rows.map((r) => ({
      file: r.file,
      status: r.status,
      real: r.scores?.real,
      face: r.scores?.face,
      whole_face: r.scores?.wholeFace,
      multiple_people: r.scores?.multiplePeople,
      subject: r.scores?.subject,
      subject_confidence: r.scores?.subjectConfidence,
      questions_version: r.scores?.questionsVersion,
      input_tokens: r.scores?.inputTokens,
      latency_ms: r.ms,
      error: r.error,
    })),
  );
}
