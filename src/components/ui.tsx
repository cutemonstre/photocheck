import { useEffect, useState } from "react";
import type { GateStatus } from "../lib/api";
import { STATUS_LABEL } from "../lib/api";

export const STATUS_TONE: Record<GateStatus, string> = {
  ok: "chip-ok",
  check_by_hand: "chip-warn",
  not_a_person: "chip-bad",
  face_not_clear: "chip-bad",
  not_checked: "chip-idle",
};

export function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function StatusChip({ status }: { status: GateStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>;
}

export function Spinner() {
  return (
    <svg className="spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** One probability bar. Grows from 0 to its value once, after mount. */
export function Bar({ label, value }: { label: string; value: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <span className="text-sm text-muted">{label}</span>
      <span className="num text-sm">{value.toFixed(2)}</span>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-track" role="img" aria-label={`${label}: ${value.toFixed(2)}`}>
        <div className="bar-fill h-full rounded-full bg-accent" style={{ width: shown ? `${pct}%` : "0%" }} />
      </div>
    </div>
  );
}

export const btn =
  "inline-flex items-center justify-center rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-track cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
export const btnPrimary =
  "inline-flex items-center justify-center rounded-md border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
