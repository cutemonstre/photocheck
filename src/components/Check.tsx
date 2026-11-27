import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { estimateCost } from "../core/questions";
import { Unauthorised, uploadPhoto, type UploadOutcome } from "../lib/api";
import { HowItDecides } from "./HowItDecides";
import { ScoreBars } from "./ScoreBars";
import { TokenField } from "./TokenField";
import { btn, Chip, Spinner, StatusChip } from "./ui";

type Item = {
  id: number;
  file: File;
  thumb: string;
  phase: "waiting" | "checking" | "done";
  outcome?: UploadOutcome;
};

const CONCURRENCY = 3;
const ACCEPT = "image/jpeg,image/png,image/webp";
let nextId = 1;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

export function Check() {
  const [items, setItems] = useState<Item[]>([]);
  const [needToken, setNeedToken] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const pausedRef = useRef(false);
  const generation = useRef(0); // bumps on Clear so late results are dropped

  const patch = useCallback((id: number, p: Partial<Item>) => setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...p } : it))), []);

  // Start waiting items while fewer than CONCURRENCY are in flight.
  useEffect(() => {
    if (pausedRef.current) return;
    const running = items.filter((i) => i.phase === "checking").length;
    const next = items.filter((i) => i.phase === "waiting").slice(0, CONCURRENCY - running);
    for (const it of next) {
      const gen = generation.current;
      patch(it.id, { phase: "checking" });
      uploadPhoto(it.file).then(
        (outcome) => gen === generation.current && patch(it.id, { phase: "done", outcome }),
        (err) => {
          if (gen !== generation.current) return;
          if (err instanceof Unauthorised) {
            pausedRef.current = true;
            setNeedToken(true);
            patch(it.id, { phase: "waiting" });
          } else {
            patch(it.id, { phase: "done", outcome: { httpStatus: 0, message: "Something went wrong. Try again.", ms: 0 } });
          }
        },
      );
    }
  }, [items, patch]);

  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.thumb)), []);

  const add = (files: FileList | File[]) => {
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!picked.length) return;
    setItems((cur) => [
      ...picked.map((file): Item => ({ id: nextId++, file, thumb: URL.createObjectURL(file), phase: "waiting" })),
      ...cur,
    ]);
  };

  const clear = () => {
    generation.current++;
    itemsRef.current.forEach((i) => URL.revokeObjectURL(i.thumb));
    pausedRef.current = false;
    setNeedToken(false);
    setItems([]);
  };

  const summary = useMemo(() => {
    const done = items.filter((i) => i.phase === "done" && i.outcome);
    const counts: Record<string, number> = {};
    for (const i of done) {
      const k = i.outcome!.status ?? "error";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const times = done.filter((i) => i.outcome!.scores).map((i) => i.outcome!.ms);
    const tokens = done.reduce((n, i) => n + (i.outcome!.scores?.inputTokens ?? 0), 0);
    return { done: done.length, counts, median: median(times), tokens, cost: estimateCost(tokens) };
  }, [items]);

  return (
    <div className="grid gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line bg-surface"
        }`}
      >
        <p className="text-lg font-medium">Drop photos here</p>
        <p className="text-sm text-muted">JPEG, PNG or WebP, up to 4 MB each. Each photo is checked by Clef and shown below.</p>
        <button type="button" className={btn} onClick={() => inputRef.current?.click()}>
          Choose photos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          aria-label="Choose photos"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {needToken && (
        <TokenField
          onSubmit={() => {
            pausedRef.current = false;
            setNeedToken(false);
            setItems((cur) => [...cur]); // re-run the queue
          }}
        />
      )}

      {items.length > 0 && (
        <section aria-label="Summary" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <span className="num">
            {summary.done}/{items.length} checked
          </span>
          {(["ok", "check_by_hand", "not_a_person", "face_not_clear", "not_checked", "error"] as const).map(
            (k) =>
              summary.counts[k] !== undefined && (
                <span key={k} className="text-muted">
                  {k === "error" ? "Errors" : { ok: "OK", check_by_hand: "Check by hand", not_a_person: "Not a person", face_not_clear: "Face not clear", not_checked: "Not checked" }[k]}{" "}
                  <span className="num text-fg">{summary.counts[k]}</span>
                </span>
              ),
          )}
          <span className="text-muted">
            Median <span className="num text-fg">{summary.median ?? "-"}</span> ms
          </span>
          <span className="text-muted">
            Input tokens <span className="num text-fg">{summary.tokens.toLocaleString()}</span>
          </span>
          <span className="text-muted">
            Est. cost <span className="num text-fg">${summary.cost.toFixed(5)}</span>
          </span>
          <button type="button" className={`${btn} ml-auto`} onClick={clear}>
            Clear
          </button>
        </section>
      )}

      <ul className="grid gap-4" aria-live="polite">
        {items.map((it) => (
          <ResultCard key={it.id} item={it} />
        ))}
      </ul>

      <HowItDecides />
    </div>
  );
}

function ResultCard({ item }: { item: Item }) {
  const { outcome: o } = item;
  return (
    <li className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[9rem_1fr]">
      <img src={item.thumb} alt={`Preview of ${item.file.name}`} className="h-36 w-full rounded-lg bg-track object-cover sm:w-36" />
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium" title={item.file.name}>
            {item.file.name}
          </span>
          {item.phase !== "done" && (
            <Chip tone="chip-idle">
              {item.phase === "checking" && <Spinner />}
              {item.phase === "checking" ? "Checking" : "Waiting"}
            </Chip>
          )}
          {o && (o.status ? <StatusChip status={o.status} /> : <Chip tone="chip-bad">Error {o.httpStatus || ""}</Chip>)}
          {o && o.httpStatus > 0 && <span className="num ml-auto text-sm text-muted">{o.ms} ms</span>}
        </div>
        {o && <p className="text-sm">{o.message}</p>}
        {o?.scores && <ScoreBars scores={o.scores} />}
        {o?.status === "not_checked" && !o.scores && <p className="text-sm text-muted">Clef did not answer, so there are no scores.</p>}
      </div>
    </li>
  );
}
