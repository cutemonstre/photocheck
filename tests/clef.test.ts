import { describe, expect, it, vi } from "vitest";
import { askClef, buildRequest, ClefError, parseAnswers, type ClefResult } from "../src/core/clef.js";

const v2Result: ClefResult = {
  answers: {
    real_photo: { noul: 0.98 },
    face_visible: { noul: 0.9 },
    whole_face: { noul: 0.8 },
    multiple_people: { noul: 0.1 },
    subject: { choice: "person", confidence: 0.97 },
  },
  usage: { input_tokens: 812 },
};

describe("buildRequest", () => {
  it("always sends model clef, never clef-flash", () => {
    const body = buildRequest(2, "data:image/jpeg;base64,AAAA");
    expect(body.model).toBe("clef");
    expect(body.images).toEqual(["data:image/jpeg;base64,AAAA"]);
    expect(Object.keys(body.questions)).toEqual(["real_photo", "face_visible", "subject", "whole_face", "multiple_people"]);
  });
  it("version 1 has three questions", () => expect(Object.keys(buildRequest(1, "x").questions)).toHaveLength(3));
  it("rejects an unknown version", () => expect(() => buildRequest(9, "x")).toThrow(/Unknown questions version/));
});

describe("parseAnswers", () => {
  it("reads version 2 answers", () => {
    expect(parseAnswers(v2Result, 2)).toEqual({
      real: 0.98, face: 0.9, wholeFace: 0.8, multiplePeople: 0.1, subject: "person", subjectConfidence: 0.97, questionsVersion: 2, inputTokens: 812,
    });
  });
  it("leaves framing undefined for version 1", () => {
    const s = parseAnswers(v2Result, 1);
    expect(s.wholeFace).toBeUndefined();
    expect(s.multiplePeople).toBeUndefined();
  });
  it("throws when a version 2 answer is missing", () => {
    const { whole_face: _w, ...answers } = v2Result.answers;
    expect(() => parseAnswers({ answers }, 2)).toThrow(ClefError);
  });
  it("throws on a probability outside 0 to 1", () => {
    expect(() => parseAnswers({ answers: { ...v2Result.answers, real_photo: { noul: 1.5 } } }, 2)).toThrow(/real_photo/);
  });
  it("throws on a malformed subject", () => {
    expect(() => parseAnswers({ answers: { ...v2Result.answers, subject: { noul: 0.5 } } }, 2)).toThrow(/subject/);
  });
  it("defaults tokens to 0 when usage is missing", () => expect(parseAnswers({ answers: v2Result.answers }, 2).inputTokens).toBe(0));
});

const ok = () => new Response(JSON.stringify({ success: true, result: v2Result, errors: [] }), { status: 200 });
const status = (code: number, body: unknown = {}) => new Response(JSON.stringify(body), { status: code });
const opts = (f: typeof fetch, sleep = vi.fn(async (_ms: number) => {})) => ({
  accountId: "acct", token: "tok", version: 2, imageDataUrl: "data:image/jpeg;base64,AAAA", fetch: f, sleep,
});

describe("askClef", () => {
  it("posts to the REST endpoint with a bearer token", async () => {
    const f = vi.fn(async () => ok());
    const scores = await askClef(opts(f as unknown as typeof fetch));
    expect(scores.real).toBe(0.98);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string).model).toBe("clef");
  });

  it("retries 429 and 5xx with 2s, 4s, 8s backoff then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(status(429)).mockResolvedValueOnce(status(503)).mockResolvedValueOnce(status(500)).mockResolvedValueOnce(ok());
    const sleep = vi.fn(async (_ms: number) => {});
    await askClef(opts(f as unknown as typeof fetch, sleep));
    expect(f).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
  });

  it("gives up after 4 attempts", async () => {
    const f = vi.fn(async () => status(429, { errors: [{ code: 2001, message: "Rate limited" }] }));
    await expect(askClef(opts(f as unknown as typeof fetch))).rejects.toThrow(/Rate limited.*gave up after 4 attempts/);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it("does not retry other errors and shows the API error text", async () => {
    const f = vi.fn(async () => status(400, { success: false, errors: [{ code: 3030, message: "Unsupported model 'clef-flash'. Use 'clef'." }] }));
    const p = askClef(opts(f as unknown as typeof fetch));
    await expect(p).rejects.toThrow(/Unsupported model.*3030/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("does not retry a bad token (401)", async () => {
    const f = vi.fn(async () => status(401, { errors: [{ code: 10000, message: "Authentication error" }] }));
    await expect(askClef(opts(f as unknown as typeof fetch))).rejects.toThrow(/Authentication error/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries network failures", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce(ok());
    await askClef(opts(f as unknown as typeof fetch));
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("treats success:false with HTTP 200 as an error", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ message: "nope" }] }), { status: 200 }));
    await expect(askClef(opts(f as unknown as typeof fetch))).rejects.toThrow(/nope/);
  });
});
