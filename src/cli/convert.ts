import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);
export const MAX_SIDE = 1024;

async function viaSharp(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .rotate() // apply EXIF orientation
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** macOS only: sips can read HEIC and camera RAW such as DNG when sharp cannot. */
async function viaSips(input: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "photocheck-"));
  try {
    const src = join(dir, "in");
    const dst = join(dir, "out.jpg");
    await writeFile(src, input);
    await run("sips", ["-s", "format", "jpeg", "-Z", String(MAX_SIDE), src, "--out", dst]);
    // Run the result through sharp so EXIF rotation and the size limit are applied the same way.
    return await viaSharp(await readFile(dst));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Convert any readable image to a JPEG, longest side at most 1024 px. Throws if no converter can read it. */
export async function toJpeg(input: Buffer): Promise<Buffer> {
  try {
    return await viaSharp(input);
  } catch (sharpError) {
    if (process.platform !== "darwin") throw sharpError;
    try {
      return await viaSips(input);
    } catch {
      throw sharpError;
    }
  }
}
