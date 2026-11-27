import { getQuestions, STATE } from "./questions.js";
import type { Scores } from "./types.js";

export const CLEF_MODEL_ID = "@cf/cloudflare/clef";
/** The body field must be "clef". "clef-flash" is rejected by the API (error 3030). */
export const CLEF_MODEL_FIELD = "clef";

export interface ClefRequestBody {
  model: string;
  state: string;
  questions: ReturnType<typeof getQuestions>;
  images: string[];
}

/** Clef answers: noul questions give `{noul}`, choice questions give `{choice, confidence}`. */
export type ClefAnswer = { noul: number } | { choice: string; confidence: number };
export interface ClefResult {
  answers: Record<string, ClefAnswer>;
  usage?: { input_tokens?: number };
}

export class ClefError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ClefError";
  }
}

/** Same body for the REST API and the Workers AI binding. `imageDataUrl` must be a data: URL. */
export function buildRequest(version: number, imageDataUrl: string): ClefRequestBody {
  return { model: CLEF_MODEL_FIELD, state: STATE, questions: getQuestions(version), images: [imageDataUrl] };
}

function noul(answers: ClefResult["answers"], key: string): number {
  const a = answers[key];
  if (!a || !("noul" in a) || typeof a.noul !== "number" || !(a.noul >= 0 && a.noul <= 1)) {
    throw new ClefError(`Clef returned an unexpected answer for "${key}".`);
  }
  return a.noul;
}

/** Read Clef's answers into a scores object. Throws ClefError if an expected answer is missing or malformed. */
export function parseAnswers(result: ClefResult, version: number): Scores {
  const answers = result?.answers;
  if (!answers || typeof answers !== "object") throw new ClefError("Clef returned no answers.");
  const questions = getQuestions(version);
  const subject = answers.subject;
  if (!subject || !("choice" in subject) || typeof subject.choice !== "string" || typeof subject.confidence !== "number") {
    throw new ClefError('Clef returned an unexpected answer for "subject".');
  }
  const scores: Scores = {
    real: noul(answers, "real_photo"),
    face: noul(answers, "face_visible"),
    subject: subject.choice,
    subjectConfidence: subject.confidence,
    questionsVersion: version,
    inputTokens: result.usage?.input_tokens ?? 0,
  };
  if ("whole_face" in questions) scores.wholeFace = noul(answers, "whole_face");
  if ("multiple_people" in questions) scores.multiplePeople = noul(answers, "multiple_people");
  return scores;
}

export interface AskClefOptions {
  accountId: string;
  token: string;
  version: number;
  imageDataUrl: string;
  fetch?: typeof fetch;
  /** Replace the backoff wait in tests. */
  sleep?: (ms: number) => Promise<void>;
}

const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [2000, 4000, 8000];
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function apiErrorText(body: unknown, fallback: string): string {
  const errors = (body as { errors?: { code?: number; message?: string }[] } | null)?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((e) => (e.code ? `${e.message} (code ${e.code})` : e.message)).join("; ");
  }
  return fallback;
}

/** Call Clef over REST. Retries 429 and 5xx (and network errors) up to 4 attempts, waiting 2s, 4s, 8s. */
export async function askClef(opts: AskClefOptions): Promise<Scores> {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/ai/run/${CLEF_MODEL_ID}`;
  const body = JSON.stringify(buildRequest(opts.version, opts.imageDataUrl));
  let lastError: ClefError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
        body,
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON error page */
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!res.ok || (json as { success?: boolean } | null)?.success === false) {
        const detail = apiErrorText(json, text.slice(0, 200) || res.statusText);
        throw new ClefError(`Clef request failed (HTTP ${res.status}): ${detail}`, res.status, retryable);
      }
      const result = (json as { result?: ClefResult } | null)?.result;
      if (!result) throw new ClefError("Clef response had no result.", res.status);
      return parseAnswers(result, opts.version);
    } catch (err) {
      const e =
        err instanceof ClefError ? err : new ClefError(`Could not reach Clef: ${(err as Error).message}`, undefined, true);
      if (!e.retryable) throw e;
      lastError = e;
      if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1] ?? 8000);
    }
  }
  throw new ClefError(`${lastError?.message} (gave up after ${MAX_ATTEMPTS} attempts)`, lastError?.status, false);
}
