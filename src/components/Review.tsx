import { useCallback, useEffect, useState } from "react";
import { fetchPhotoUrl, fetchReviewable, setReview, Unauthorised, type ReviewDecision, type StoredResult } from "../lib/api";
import { ScoreBars } from "./ScoreBars";
import { TokenField } from "./TokenField";
import { btn, btnPrimary, Chip, StatusChip } from "./ui";

type Filter = "all" | "todo" | "decided";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["todo", "To review"],
  ["decided", "Decided"],
];

export function Review() {
  const [rows, setRows] = useState<StoredResult[] | null>(null);
  const [needToken, setNeedToken] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await fetchReviewable());
      setNeedToken(false);
    } catch (e) {
      if (e instanceof Unauthorised) setNeedToken(true);
      else setError(e instanceof Error ? e.message : "Could not load photos.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const shown = (rows ?? []).filter((r) => (filter === "all" ? true : filter === "todo" ? !r.review_status : !!r.review_status));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter" className="inline-flex overflow-hidden rounded-md border border-line">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${filter === k ? "bg-accent text-accent-fg" : "bg-surface hover:bg-track"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className={btn} onClick={load}>
          Refresh
        </button>
      </div>

      {needToken && <TokenField onSubmit={load} />}
      {error && (
        <p role="alert" className="text-sm text-[var(--bad-fg)]">
          {error}
        </p>
      )}
      {rows && shown.length === 0 && (
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          {rows.length === 0 ? "No photos need a person to look at them." : "Nothing in this filter."}
        </p>
      )}
      <ul className="grid gap-4" aria-live="polite">
        {shown.map((r) => (
          <ReviewCard
            key={r.id}
            row={r}
            onChange={(d) => setRows((cur) => cur && cur.map((x) => (x.id === r.id ? { ...x, review_status: d, reviewed_at: d ? new Date().toISOString() : null } : x)))}
            onUnauthorised={() => setNeedToken(true)}
          />
        ))}
      </ul>
    </div>
  );
}

function ReviewCard({ row, onChange, onUnauthorised }: { row: StoredResult; onChange: (d: ReviewDecision | null) => void; onUnauthorised: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!row.r2_key) return;
    let url: string | null = null;
    let live = true;
    fetchPhotoUrl(row.r2_key).then(
      (u) => (live ? ((url = u), setSrc(u)) : URL.revokeObjectURL(u)),
      (e) => e instanceof Unauthorised && onUnauthorised(),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [row.r2_key, onUnauthorised]);

  const decide = async (d: ReviewDecision | null) => {
    setBusy(true);
    setErr("");
    try {
      await setReview(row.id, d);
      onChange(d);
    } catch (e) {
      if (e instanceof Unauthorised) onUnauthorised();
      else setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[9rem_1fr]">
      {src ? (
        <img src={src} alt={`Stored photo from ${new Date(row.created_at).toLocaleString()}`} className="h-36 w-full rounded-lg bg-track object-cover sm:w-36" />
      ) : (
        <div className="h-36 w-full rounded-lg bg-track sm:w-36" aria-hidden="true" />
      )}
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={row.status} />
          {row.review_status && (
            <Chip tone={row.review_status === "approved" ? "chip-ok" : "chip-bad"}>
              {row.review_status === "approved" ? "Approved" : "Needs new photo"}
            </Chip>
          )}
          <span className="num ml-auto text-sm text-muted">{new Date(row.created_at).toLocaleString()}</span>
        </div>
        {row.scores ? <ScoreBars scores={row.scores} /> : <p className="text-sm text-muted">No scores. Clef did not answer for this photo.</p>}
        <div className="flex flex-wrap gap-2">
          {row.review_status ? (
            <button type="button" className={btn} disabled={busy} onClick={() => decide(null)}>
              Undo
            </button>
          ) : (
            <>
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => decide("approved")}>
                Approve
              </button>
              <button type="button" className={btn} disabled={busy} onClick={() => decide("needs_new_photo")}>
                Needs new photo
              </button>
            </>
          )}
        </div>
        {err && (
          <p role="alert" className="text-sm text-[var(--bad-fg)]">
            {err}
          </p>
        )}
      </div>
    </li>
  );
}
