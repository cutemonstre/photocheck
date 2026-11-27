import { describe, expect, it, vi } from "vitest";
import { handle, type GateEnv } from "../src/server/gate.js";

const STORED = "11111111-2222-3333-4444-555555555555.png";
const MISSING_ID = "99999999-2222-3333-4444-555555555555";
const ROW_ID = "aaaaaaaa-2222-3333-4444-555555555555";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const HEIC = new Uint8Array([0, 0, 0, 24, ...[..."ftypheic"].map((c) => c.charCodeAt(0)), 0, 0]);

const answers = (real: number, face: number, subject = "person", whole = 0.95, multi = 0.05) => ({
  answers: {
    real_photo: { noul: real }, face_visible: { noul: face }, whole_face: { noul: whole }, multiple_people: { noul: multi },
    subject: { choice: subject, confidence: 0.95 },
  },
  usage: { input_tokens: 900 },
});

function makeEnv(aiResult: unknown | Error, extra: Partial<GateEnv> = {}) {
  const puts: { key: string; type?: string }[] = [];
  const inserts: unknown[][] = [];
  const env: GateEnv = {
    AI: { run: vi.fn(async () => { if (aiResult instanceof Error) throw aiResult; return aiResult; }) },
    PHOTOS: {
      put: async (key, _v, o) => { puts.push({ key, type: o?.httpMetadata?.contentType }); },
      get: vi.fn(async (key: string) => (key === STORED ? { body: new Response("img").body, httpMetadata: { contentType: "image/png" } } : null)),
    },
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          run: async () => { inserts.push(values); return { meta: { changes: values[2] === MISSING_ID ? 0 : 1 } }; },
          all: async () => ({ results: [{ id: "1", status: values[0] ?? "any", scores: '{"real":1}', sql }] }),
        }),
      }),
    },
    ...extra,
  };
  return { env, puts, inserts };
}

function uploadRequest(bytes: Uint8Array, headers: Record<string, string> = {}, name = "me.jpg") {
  const form = new FormData();
  form.append("photo", new File([bytes as unknown as ArrayBuffer], name));
  return new Request("https://x.test/upload", { method: "POST", body: form, headers });
}

describe("POST /upload", () => {
  it("saves an ok photo and returns 200", async () => {
    const { env, puts, inserts } = makeEnv(answers(0.99, 0.98));
    const res = await handle(uploadRequest(JPEG), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; key: string; scores: { real: number }; message: string };
    expect(body.status).toBe("ok");
    expect(body.key).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(puts).toEqual([{ key: body.key, type: "image/jpeg" }]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]![2]).toBe("ok");
  });

  it("uses the detected type, not the file name", async () => {
    const { env, puts } = makeEnv(answers(0.99, 0.98));
    await handle(uploadRequest(PNG, {}, "me.jpg"), env);
    expect(puts[0]!.key.endsWith(".png")).toBe(true);
    expect(puts[0]!.type).toBe("image/png");
  });

  it("saves check_by_hand photos", async () => {
    const { env, puts } = makeEnv(answers(0.99, 0.98, "person", 0.2));
    const res = await handle(uploadRequest(JPEG), env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("check_by_hand");
    expect(puts).toHaveLength(1);
  });

  it("rejects a cartoon with 422 and does not save it", async () => {
    const { env, puts, inserts } = makeEnv(answers(0.05, 0.1, "cartoon_or_drawing"));
    const res = await handle(uploadRequest(JPEG), env);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status: string; message: string; key?: string };
    expect(body.status).toBe("not_a_person");
    expect(body.key).toBeUndefined();
    expect(puts).toHaveLength(0);
    expect(inserts[0]![1]).toBeNull();
    expect(inserts[0]![2]).toBe("not_a_person");
  });

  it("rejects an unclear face with a helpful message", async () => {
    const { env } = makeEnv(answers(0.9, 0.05));
    const res = await handle(uploadRequest(JPEG), env);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toMatch(/can't see a face/);
  });

  it("returns 413 for a file over 4 MiB", async () => {
    const { env } = makeEnv(answers(1, 1));
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(JPEG);
    expect((await handle(uploadRequest(big), env)).status).toBe(413);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it("returns 415 for unsupported files, with a specific HEIC message", async () => {
    const { env } = makeEnv(answers(1, 1));
    expect((await handle(uploadRequest(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])), env)).status).toBe(415);
    const res = await handle(uploadRequest(HEIC), env);
    expect(res.status).toBe(415);
    expect(((await res.json()) as { error: string }).error).toMatch(/JPEG or PNG/);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it("returns 400 when there is no photo field", async () => {
    const { env } = makeEnv(answers(1, 1));
    const form = new FormData();
    form.append("other", "x");
    const res = await handle(new Request("https://x.test/upload", { method: "POST", body: form }), env);
    expect(res.status).toBe(400);
  });

  it("fails open when Clef errors", async () => {
    const { env, puts, inserts } = makeEnv(new Error("Clef is down"));
    const res = await handle(uploadRequest(JPEG), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; key: string };
    expect(body.status).toBe("not_checked");
    expect(puts).toHaveLength(1);
    expect(inserts[0]![2]).toBe("not_checked");
  });

  it("fails open when Clef returns a malformed result", async () => {
    const { env } = makeEnv({ answers: {} });
    const res = await handle(uploadRequest(JPEG), env);
    expect(((await res.json()) as { status: string }).status).toBe("not_checked");
  });

  it("still answers when the database write fails", async () => {
    const { env } = makeEnv(answers(1, 1));
    env.DB = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error("d1 down"); }, all: async () => ({ results: [] }) }) }) };
    expect((await handle(uploadRequest(JPEG), env)).status).toBe(200);
  });

  it("sends the Clef request to the binding with model clef", async () => {
    const { env } = makeEnv(answers(1, 1));
    await handle(uploadRequest(JPEG), env);
    const [model, input] = (env.AI.run as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { model: string; images: string[] }];
    expect(model).toBe("@cf/cloudflare/clef");
    expect(input.model).toBe("clef");
    expect(input.images[0]).toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe("token check", () => {
  it("returns 401 without the token and 200 with it", async () => {
    const { env } = makeEnv(answers(1, 1), { UPLOAD_TOKEN: "secret" });
    expect((await handle(uploadRequest(JPEG), env)).status).toBe(401);
    expect((await handle(uploadRequest(JPEG, { Authorization: "Bearer nope" }), env)).status).toBe(401);
    expect((await handle(uploadRequest(JPEG, { Authorization: "Bearer secret" }), env)).status).toBe(200);
  });
  it("protects /api/results too", async () => {
    const { env } = makeEnv(answers(1, 1), { UPLOAD_TOKEN: "secret" });
    expect((await handle(new Request("https://x.test/api/results"), env)).status).toBe(401);
    const ok = await handle(new Request("https://x.test/api/results", { headers: { Authorization: "Bearer secret" } }), env);
    expect(ok.status).toBe(200);
  });
  it("protects photos and review too", async () => {
    const { env } = makeEnv(answers(1, 1), { UPLOAD_TOKEN: "secret" });
    expect((await handle(new Request(`https://x.test/photos/${STORED}`), env)).status).toBe(401);
    expect((await handle(reviewRequest(ROW_ID, { decision: "approved" }), env)).status).toBe(401);
  });
});

describe("GET /api/results and routing", () => {
  it("filters by status and parses scores", async () => {
    const { env } = makeEnv(answers(1, 1));
    const res = await handle(new Request("https://x.test/api/results?status=ok"), env);
    const body = (await res.json()) as { results: { status: string; scores: { real: number } }[] };
    expect(body.results[0]).toMatchObject({ status: "ok", scores: { real: 1 } });
  });
  it("rejects an unknown status", async () => {
    const { env } = makeEnv(answers(1, 1));
    expect((await handle(new Request("https://x.test/api/results?status=bogus"), env)).status).toBe(400);
  });
  it("returns 404 and 405", async () => {
    const { env } = makeEnv(answers(1, 1));
    expect((await handle(new Request("https://x.test/nope"), env)).status).toBe(404);
    expect((await handle(new Request("https://x.test/upload"), env)).status).toBe(405);
  });
});

function reviewRequest(id: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://x.test/api/results/${id}/review`, { method: "POST", body: JSON.stringify(body), headers });
}

describe("GET /photos/:key", () => {
  it("streams a stored photo with its content type", async () => {
    const { env } = makeEnv(answers(1, 1));
    const res = await handle(new Request(`https://x.test/photos/${STORED}`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(await res.text()).toBe("img");
  });
  it("returns 404 for a missing photo", async () => {
    const { env } = makeEnv(answers(1, 1));
    expect((await handle(new Request("https://x.test/photos/00000000-2222-3333-4444-555555555555.jpg"), env)).status).toBe(404);
  });
  it("validates the key shape before touching R2", async () => {
    const { env } = makeEnv(answers(1, 1));
    for (const bad of ["..%2Fsecret", "abc.jpg", `${STORED}.exe`, "11111111-2222-3333-4444-555555555555.gif", "%E0%A4%A"]) {
      expect((await handle(new Request(`https://x.test/photos/${bad}`), env)).status).toBe(404);
    }
    expect(env.PHOTOS.get).not.toHaveBeenCalled();
  });
});

describe("POST /api/results/:id/review", () => {
  it("sets and clears a decision", async () => {
    const { env, inserts } = makeEnv(answers(1, 1));
    const a = await handle(reviewRequest(ROW_ID, { decision: "approved" }), env);
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ id: ROW_ID, review_status: "approved" });
    const b = await handle(reviewRequest(ROW_ID, { decision: null }), env);
    expect(await b.json()).toEqual({ id: ROW_ID, review_status: null, reviewed_at: null });
    expect(inserts[0]!.slice(0, 1)).toEqual(["approved"]);
    expect(inserts[1]!.slice(0, 2)).toEqual([null, null]);
  });
  it("rejects bad decisions and bad JSON with 400", async () => {
    const { env } = makeEnv(answers(1, 1));
    expect((await handle(reviewRequest(ROW_ID, { decision: "maybe" }), env)).status).toBe(400);
    expect((await handle(reviewRequest(ROW_ID, {}), env)).status).toBe(400);
    expect((await handle(new Request(`https://x.test/api/results/${ROW_ID}/review`, { method: "POST", body: "{" }), env)).status).toBe(400);
  });
  it("returns 404 for an unknown or malformed id", async () => {
    const { env } = makeEnv(answers(1, 1));
    expect((await handle(reviewRequest(MISSING_ID, { decision: "approved" }), env)).status).toBe(404);
    expect((await handle(reviewRequest("nope", { decision: "approved" }), env)).status).toBe(404);
  });
  it("includes the review fields in /api/results", async () => {
    const { env } = makeEnv(answers(1, 1));
    const res = await handle(new Request("https://x.test/api/results"), env);
    const { results } = (await res.json()) as { results: { sql: string }[] };
    expect(results[0]!.sql).toContain("review_status, reviewed_at");
  });
});
