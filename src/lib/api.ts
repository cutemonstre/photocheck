/** Browser-side helpers for the photocheck HTTP API. The token lives in memory only. */

export type GateStatus = "ok" | "check_by_hand" | "not_a_person" | "face_not_clear" | "not_checked";
export type ReviewDecision = "approved" | "needs_new_photo";

export interface Scores {
  real: number;
  face: number;
  subject: string;
  subjectConfidence: number;
  wholeFace?: number;
  multiplePeople?: number;
  questionsVersion: number;
  inputTokens: number;
}

export interface UploadOutcome {
  httpStatus: number;
  status?: GateStatus;
  scores?: Scores | null;
  message: string;
  key?: string;
  /** Round trip measured in the browser, in milliseconds. */
  ms: number;
}

export interface StoredResult {
  id: string;
  r2_key: string | null;
  status: GateStatus;
  scores: Scores | null;
  questions_version: number | null;
  input_tokens: number;
  created_at: string;
  review_status: ReviewDecision | null;
  reviewed_at: string | null;
}

let token = "";
const listeners = new Set<() => void>();
export const getToken = () => token;
export const setToken = (t: string) => {
  token = t.trim();
  listeners.forEach((l) => l());
};
export const subscribeToken = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

/** Raised on 401 so the UI can ask for a token. */
export class Unauthorised extends Error {}

export async function uploadPhoto(file: File): Promise<UploadOutcome> {
  const form = new FormData();
  form.append("photo", file);
  const t0 = performance.now();
  try {
    const res = await fetch("/upload", { method: "POST", body: form, headers: authHeaders() });
    const ms = Math.round(performance.now() - t0);
    const body = (await res.json().catch(() => ({}))) as {
      status?: GateStatus;
      scores?: Scores | null;
      message?: string;
      error?: string;
      key?: string;
    };
    if (res.status === 401) throw new Unauthorised(body.error ?? "A token is needed.");
    return {
      httpStatus: res.status,
      status: body.status,
      scores: body.scores,
      key: body.key,
      message: body.message ?? body.error ?? `The server answered ${res.status}.`,
      ms,
    };
  } catch (err) {
    if (err instanceof Unauthorised) throw err;
    return { httpStatus: 0, message: "Could not reach the server. Check your connection and try again.", ms: Math.round(performance.now() - t0) };
  }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  if (res.status === 401) throw new Unauthorised("A token is needed.");
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `The server answered ${res.status}.`);
  return (await res.json()) as T;
}

export async function fetchReviewable(): Promise<StoredResult[]> {
  const pages = await Promise.all(
    (["check_by_hand", "not_checked"] as const).map((s) => json<{ results: StoredResult[] }>(`/api/results?status=${s}`)),
  );
  return pages.flatMap((p) => p.results).sort((x, y) => y.created_at.localeCompare(x.created_at));
}

export const setReview = (id: string, decision: ReviewDecision | null) =>
  json<{ id: string; review_status: ReviewDecision | null; reviewed_at: string | null }>(`/api/results/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });

/** Photos need the bearer token, so an <img src> cannot load them. Fetch and make an object URL. */
export async function fetchPhotoUrl(key: string): Promise<string> {
  const res = await fetch(`/photos/${key}`, { headers: authHeaders() });
  if (res.status === 401) throw new Unauthorised("A token is needed.");
  if (!res.ok) throw new Error("Photo not found.");
  return URL.createObjectURL(await res.blob());
}

export const STATUS_LABEL: Record<GateStatus, string> = {
  ok: "OK",
  check_by_hand: "Check by hand",
  not_a_person: "Not a person",
  face_not_clear: "Face not clear",
  not_checked: "Not checked",
};
