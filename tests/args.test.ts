import { describe, expect, it } from "vitest";
import { intFlag, intListFlag, parseArgs } from "../src/cli/args.js";
import { parseEnv } from "../src/cli/env.js";
import { parseListObjects, parseR2Url, parseUrlList } from "../src/cli/sources.js";
import { rowsToCsv, summarise } from "../src/cli/report.js";

describe("parseArgs", () => {
  it("splits positionals and flags", () => {
    const a = parseArgs(["folder", "--limit", "5", "--json", "--out=x.csv"]);
    expect(a.positional).toEqual(["folder"]);
    expect(a.flags).toEqual({ limit: "5", json: true, out: "x.csv" });
  });
  it("errors on a missing value", () => expect(() => parseArgs(["--limit"])).toThrow(/needs a value/));
  it("validates integers", () => {
    expect(intFlag({ limit: "5" }, "limit")).toBe(5);
    expect(() => intFlag({ limit: "0" }, "limit")).toThrow();
    expect(intListFlag({ versions: "1,2" }, "versions")).toEqual([1, 2]);
    expect(() => intListFlag({ versions: "a" }, "versions")).toThrow();
  });
});

describe("parseEnv", () => {
  it("handles comments, quotes and export", () => {
    expect(parseEnv('# c\nA=1\nexport B="two words"\nC=\'x\'\n\nbad')).toEqual({ A: "1", B: "two words", C: "x" });
  });
});

describe("sources", () => {
  it("parses a url list", () => expect(parseUrlList("# hi\nhttps://a/b.jpg\n\n https://c/d.png \n")).toEqual(["https://a/b.jpg", "https://c/d.png"]));
  it("parses R2 urls", () => expect(parseR2Url("r2://bkt/some/prefix/")).toEqual({ bucket: "bkt", prefix: "some/prefix/" }));
  it("parses a list response", () => {
    const xml = "<R><IsTruncated>true</IsTruncated><NextContinuationToken>t&amp;1</NextContinuationToken><Contents><Key>a&amp;b.jpg</Key></Contents><Contents><Key>c.png</Key></Contents></R>";
    expect(parseListObjects(xml)).toEqual({ keys: ["a&b.jpg", "c.png"], nextToken: "t&1" });
  });
});

describe("report", () => {
  const rows = [
    { file: "a.jpg", status: "ok" as const, scores: { real: 1, face: 1, subject: "person", subjectConfidence: 1, questionsVersion: 2, inputTokens: 1000 } },
    { file: "b,c.jpg", status: "unreadable" as const, error: 'bad "file"' },
  ];
  it("summarises counts, tokens and cost", () => {
    const s = summarise(rows);
    expect(s.counts.ok).toBe(1);
    expect(s.counts.unreadable).toBe(1);
    expect(s.inputTokens).toBe(1000);
    expect(s.estimatedCostUsd).toBeCloseTo(0.00024, 8);
  });
  it("writes escaped CSV", () => {
    const csv = rowsToCsv(rows);
    expect(csv.split("\n")[0]).toContain("file,status");
    expect(csv).toContain('"b,c.jpg",unreadable');
    expect(csv).toContain('"bad ""file"""');
  });
});
