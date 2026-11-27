import { classify } from "../core/classify.js";
import { buildRequest, CLEF_MODEL_ID, parseAnswers, type ClefResult } from "../core/clef.js";
import { ACCEPTED_TYPES, detectImageType, MAX_IMAGE_BYTES, toDataUrl } from "../core/image.js";
import { CURRENT_VERSION } from "../core/questions.js";
import type { Scores } from "../core/types.js";
import { ALL_GATE_STATUSES, MESSAGES, REJECTED, type GateStatus } from "./messages.js";

/** The parts of the Cloudflare bindings this code uses. Real bindings satisfy these shapes. */
export interface GateEnv {
  AI: { run(model: string, input: unknown): Promise<unknown> };
  PHOTOS: {
    put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
    get(key: string): Promise<{ body: ReadableStream | null; httpMetadata?: { contentType?: string } } | null>;
  };
  DB: {
    prepare(sql: string): {
      bind(...values: unknown[]): {
        run(): Promise<{ meta?: { changes?: number } } | unknown>;
        all(): Promise<{ results: Record<string, unknown>[] }>;
      };
    };
  };
  UPLOAD_TOKEN?: string;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function authorised(request: Request, env: GateEnv): boolean {
  if (!env.UPLOAD_TOKEN) return true;
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") && timingSafeEqual(header.slice(7), env.UPLOAD_TOKEN);
}

async function record(
  env: GateEnv,
  row: { key: string | null; status: GateStatus; scores: Scores | null },
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO photo_checks (id, r2_key, status, scores, questions_version, input_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        row.key,
        row.status,
        row.scores ? JSON.stringify(row.scores) : null,
        row.scores?.questionsVersion ?? null,
        row.scores?.inputTokens ?? 0,
        new Date().toISOString(),
      )
      .run();
  } catch (err) {
    // The upload result matters more to the person than the audit row. Log and carry on.
    console.error("Could not write photo_checks row", err);
  }
}

/** Ask Clef through the Workers AI binding. Returns null if Clef fails for any reason (fail open). */
async function check(env: GateEnv, bytes: Uint8Array, mime: string): Promise<Scores | null> {
  try {
    const body = buildRequest(CURRENT_VERSION, toDataUrl(bytes, mime));
    // Binding output is the result object itself: { answers, usage } (no `success` wrapper).
    const result = (await env.AI.run(CLEF_MODEL_ID, body)) as ClefResult;
    return parseAnswers(result, CURRENT_VERSION);
  } catch (err) {
    console.error("Clef check failed, failing open", err);
    return null;
  }
}

async function upload(request: Request, env: GateEnv): Promise<Response> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) return json({ error: "That photo is too large. The limit is 4 MB." }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Send the photo as multipart form data in a field named photo." }, 400);
  }
  const file = form.get("photo");
  if (!(file instanceof File)) return json({ error: "No photo found. Send it in a field named photo." }, 400);
  if (file.size > MAX_IMAGE_BYTES) return json({ error: "That photo is too large. The limit is 4 MB." }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (type === "heic") {
    return json({ error: "HEIC photos are not supported yet. Please upload a JPEG or PNG." }, 415);
  }
  if (type === null) {
    return json({ error: "We could not read that file as a photo. Please upload a JPEG, PNG or WebP image." }, 415);
  }
  const { mime, ext } = ACCEPTED_TYPES[type];

  const scores = await check(env, bytes, mime);
  const status: GateStatus = scores ? classify(scores) : "not_checked";

  if (REJECTED.has(status)) {
    await record(env, { key: null, status, scores });
    return json({ status, scores, message: MESSAGES[status] }, 422);
  }

  const key = `${crypto.randomUUID()}.${ext}`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: mime } });
  await record(env, { key, status, scores });
  return json({ status, key, scores, message: MESSAGES[status] });
}

async function results(url: URL, env: GateEnv): Promise<Response> {
  const status = url.searchParams.get("status");
  if (status !== null && !ALL_GATE_STATUSES.includes(status as GateStatus)) {
    return json({ error: `Unknown status. Use one of: ${ALL_GATE_STATUSES.join(", ")}.` }, 400);
  }
  const sql =
    "SELECT id, r2_key, status, scores, questions_version, input_tokens, created_at, review_status, reviewed_at FROM photo_checks" +
    (status ? " WHERE status = ?" : "") +
    " ORDER BY created_at DESC LIMIT 100";
  const stmt = env.DB.prepare(sql);
  const { results: rows } = await (status ? stmt.bind(status) : stmt.bind()).all();
  return json({
    results: rows.map((r) => ({ ...r, scores: typeof r.scores === "string" ? JSON.parse(r.scores) : null })),
  });
}

const PHOTO_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function photo(key: string, env: GateEnv): Promise<Response> {
  // Check the shape first, so nothing odd ever reaches R2.
  if (!PHOTO_KEY.test(key)) return json({ error: "Not found." }, 404);
  const object = await env.PHOTOS.get(key);
  if (!object || !object.body) return json({ error: "Not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? EXT_MIME[key.split(".")[1]!] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const REVIEW_DECISIONS = ["approved", "needs_new_photo"] as const;

async function review(id: string, request: Request, env: GateEnv): Promise<Response> {
  if (!UUID.test(id)) return json({ error: "Not found." }, 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON like { "decision": "approved" }.' }, 400);
  }
  const decision = (body as { decision?: unknown } | null)?.decision;
  if (decision !== null && !(REVIEW_DECISIONS as readonly unknown[]).includes(decision)) {
    return json({ error: 'decision must be "approved", "needs_new_photo" or null.' }, 400);
  }
  const reviewedAt = decision === null ? null : new Date().toISOString();
  const res = (await env.DB.prepare("UPDATE photo_checks SET review_status = ?, reviewed_at = ? WHERE id = ?")
    .bind(decision, reviewedAt, id)
    .run()) as { meta?: { changes?: number } };
  if (res?.meta?.changes === 0) return json({ error: "Not found." }, 404);
  return json({ id, review_status: decision, reviewed_at: reviewedAt });
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}

export async function handle(request: Request, env: GateEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const photoMatch = /^\/photos\/([^/]+)$/.exec(path);
  const reviewMatch = /^\/api\/results\/([^/]+)\/review$/.exec(path);
  let expected: string;
  if (path === "/upload" || reviewMatch) expected = "POST";
  else if (path === "/api/results" || photoMatch) expected = "GET";
  else return json({ error: "Not found." }, 404);

  if (request.method !== expected) return json({ error: `Use ${expected} for this path.` }, 405);
  if (!authorised(request, env)) return json({ error: "Missing or wrong token." }, 401);
  if (path === "/upload") return upload(request, env);
  if (path === "/api/results") return results(url, env);
  if (photoMatch) return photo(safeDecode(photoMatch[1]!), env);
  return review(safeDecode(reviewMatch![1]!), request, env);
}
