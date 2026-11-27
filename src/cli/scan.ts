import { writeFile } from "node:fs/promises";
import { classify } from "../core/classify.js";
import { askClef, ClefError } from "../core/clef.js";
import { toDataUrl } from "../core/image.js";
import { CURRENT_VERSION } from "../core/questions.js";
import { intFlag, type ParsedArgs } from "./args.js";
import { toJpeg } from "./convert.js";
import { requireCredentials } from "./env.js";
import { runPool } from "./pool.js";
import { formatLine, formatSummary, rowsToCsv, summarise, type ScanRow } from "./report.js";
import { resolveSource, type PhotoSource } from "./sources.js";

const CONCURRENCY = 3;

/** Read a photo and turn it into a JPEG data URL of at most 1024 px. Throws if it cannot be read. */
export async function prepare(photo: PhotoSource): Promise<string> {
  const jpeg = await toJpeg(await photo.load());
  return toDataUrl(jpeg, "image/jpeg");
}

export async function runScan(args: ParsedArgs): Promise<number> {
  const source = args.positional[0];
  if (!source) throw new Error("Usage: photocheck scan <folder | urls.txt | r2://bucket/prefix> [--limit N] [--out file.csv] [--questions-version N] [--json]");
  const creds = requireCredentials();
  const limit = intFlag(args.flags, "limit");
  const version = intFlag(args.flags, "questions-version") ?? CURRENT_VERSION;
  const out = typeof args.flags.out === "string" ? args.flags.out : "photocheck-results.csv";
  const asJson = args.flags.json === true;
  const log = (line: string) => (asJson ? console.error(line) : console.log(line));

  let photos = await resolveSource(source, limit);
  if (limit !== undefined) photos = photos.slice(0, limit);
  if (photos.length === 0) throw new Error(`No images found in ${source}.`);
  log(`Scanning ${photos.length} photos with question version ${version}`);

  const results: (ScanRow | undefined)[] = new Array(photos.length);
  let fatal: ClefError | undefined;

  await runPool(
    photos,
    CONCURRENCY,
    async (photo, i) => {
      let imageDataUrl: string;
      try {
        imageDataUrl = await prepare(photo);
      } catch (err) {
        results[i] = { file: photo.name, status: "unreadable", error: (err as Error).message };
        log(formatLine(results[i]!));
        return;
      }
      try {
        const started = performance.now();
        const scores = await askClef({ ...creds, version, imageDataUrl });
        const ms = Math.round(performance.now() - started);
        results[i] = { file: photo.name, status: classify(scores), scores, ms };
        log(formatLine(results[i]!));
      } catch (err) {
        // A Clef failure is not the photo's fault. Stop the run instead of marking photos unreadable.
        if (err instanceof ClefError) fatal ??= err;
        else throw err;
      }
    },
    () => fatal !== undefined,
  );

  const rows = results.filter((r): r is ScanRow => r !== undefined);
  await writeFile(out, rowsToCsv(rows));
  const summary = summarise(rows);
  if (asJson) console.log(JSON.stringify({ rows, summary }, null, 2));
  else console.log(formatSummary(summary));
  log(`Results written to ${out}`);

  if (fatal) {
    console.error(`\nStopped early: ${fatal.message}\n${rows.length} of ${photos.length} photos were checked. Fix the problem and run again.`);
    return 1;
  }
  return 0;
}
