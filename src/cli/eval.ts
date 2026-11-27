import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { classify } from "../core/classify.js";
import { askClef, ClefError } from "../core/clef.js";
import { expectedList, scoreRows, statusChanges, type EvalRow, type Labels, type VersionScore } from "../core/evaluate.js";
import { listVersions } from "../core/questions.js";
import { STATUSES, type Status } from "../core/types.js";
import { intListFlag, type ParsedArgs } from "./args.js";
import { requireCredentials } from "./env.js";
import { runPool } from "./pool.js";
import { prepare } from "./scan.js";

const CONCURRENCY = 3;

export function formatConfusion(score: VersionScore): string {
  const w = 15;
  const head = "expected \\ got".padEnd(w) + STATUSES.map((s) => s.padStart(w)).join("");
  const lines = [head];
  for (const exp of STATUSES) {
    const row = score.confusion[exp] ?? {};
    if (STATUSES.every((s) => (row[s] ?? 0) === 0)) continue;
    lines.push(exp.padEnd(w) + STATUSES.map((s) => String(row[s] ?? 0).padStart(w)).join(""));
  }
  return lines.join("\n");
}

export async function runEval(args: ParsedArgs): Promise<number> {
  const dir = args.positional[0];
  if (!dir) throw new Error("Usage: photocheck eval <folder with images and labels.json> [--versions 1,2] [--json]");
  const versions = intListFlag(args.flags, "versions") ?? listVersions();
  const asJson = args.flags.json === true;

  let labels: Labels;
  try {
    labels = JSON.parse(await readFile(join(dir, "labels.json"), "utf8")) as Labels;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No labels.json in ${dir}.\nAdd one that maps each photo to the status you expect, for example:\n  { "face.jpg": { "expected": "ok" }, "logo.png": { "expected": "not_a_person", "note": "optional" } }\n` +
          "`expected` can also be a list of acceptable statuses. This step is optional: scan works without it.",
      );
    }
    throw new Error(`Could not read ${join(dir, "labels.json")}: ${(err as Error).message}`);
  }
  const files = Object.keys(labels).sort();
  if (files.length === 0) throw new Error(`${join(dir, "labels.json")} has no entries. Add the photos you want to check.`);
  const present = await readdir(dir);
  if (!files.some((f) => present.includes(f))) {
    throw new Error(`${dir} has a labels.json but none of the labelled images are in the folder. Add the image files next to it.`);
  }

  const creds = requireCredentials();

  // Convert each image once and reuse it for every version.
  const prepared = new Map<string, Promise<string>>();
  const getImage = (file: string) => {
    let p = prepared.get(file);
    if (!p) prepared.set(file, (p = prepare({ name: file, load: () => readFile(join(dir, file)) })));
    return p;
  };

  const byVersion: Record<number, Record<string, Status>> = Object.fromEntries(versions.map((v) => [v, {}]));
  const tasks = versions.flatMap((version) => files.map((file) => ({ version, file })));
  let fatal: ClefError | undefined;

  await runPool(
    tasks,
    CONCURRENCY,
    async ({ version, file }) => {
      let imageDataUrl: string;
      try {
        imageDataUrl = await getImage(file);
      } catch {
        byVersion[version]![file] = "unreadable";
        return;
      }
      try {
        const scores = await askClef({ ...creds, version, imageDataUrl });
        byVersion[version]![file] = classify(scores);
      } catch (err) {
        if (err instanceof ClefError) fatal ??= err;
        else throw err;
      }
    },
    () => fatal !== undefined,
  );
  if (fatal) {
    console.error(`Stopped early: ${fatal.message}`);
    return 1;
  }

  const scores: Record<number, VersionScore> = {};
  for (const v of versions) {
    const rows: EvalRow[] = files.map((file) => ({
      file,
      expected: expectedList(labels[file]!.expected),
      actual: byVersion[v]![file]!,
    }));
    scores[v] = scoreRows(rows);
  }
  const changes = statusChanges(byVersion);

  if (asJson) {
    console.log(JSON.stringify({ versions: scores, changes }, null, 2));
    return 0;
  }
  for (const v of versions) {
    const s = scores[v]!;
    console.log(`\nQuestions version ${v}: ${s.correct}/${s.total} correct (${(s.accuracy * 100).toFixed(1)}%)`);
    console.log(formatConfusion(s));
    if (s.misses.length > 0) {
      console.log("Misses:");
      for (const m of s.misses) {
        const note = labels[m.file]?.note ? `  (${labels[m.file]!.note})` : "";
        console.log(`  ${m.file}: expected ${m.expected.join(" or ")}, got ${m.actual}${note}`);
      }
    }
  }
  if (versions.length > 1) {
    console.log("\nPhotos that changed status between versions:");
    if (changes.length === 0) console.log("  none");
    for (const c of changes) {
      console.log(`  ${c.file}: ${versions.map((v) => `v${v}=${c.statuses[v] ?? "-"}`).join(" ")}`);
    }
  }
  return 0;
}
