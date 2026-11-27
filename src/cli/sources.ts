import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { AwsClient } from "aws4fetch";

export interface PhotoSource {
  /** Display name: relative path, URL or object key. */
  name: string;
  load(): Promise<Buffer>;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|dng|gif|tiff?|avif|bmp)$/i;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && IMAGE_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

export async function folderSource(dir: string): Promise<PhotoSource[]> {
  const files = (await walk(dir)).sort();
  return files.map((f) => ({ name: relative(dir, f), load: () => readFile(f) }));
}

export function parseUrlList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export function urlListSource(urls: string[]): PhotoSource[] {
  return urls.map((url) => ({
    name: url,
    async load() {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    },
  }));
}

const XML_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** Pull object keys (and the continuation token) out of an S3 ListObjectsV2 response. */
export function parseListObjects(xml: string): { keys: string[]; nextToken?: string } {
  const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
  const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) => unescape(m[1]!));
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1];
  return { keys, nextToken: truncated && next ? unescape(next) : undefined };
}

export function parseR2Url(source: string): { bucket: string; prefix: string } {
  const m = /^r2:\/\/([^/]+)\/?(.*)$/.exec(source);
  if (!m) throw new Error(`Not an R2 source: ${source}. Use r2://bucket/prefix.`);
  return { bucket: m[1]!, prefix: m[2]! };
}

/** List and read objects from R2 through its S3-compatible API. */
export async function r2Source(source: string, limit?: number): Promise<PhotoSource[]> {
  const { bucket, prefix } = parseR2Url(source);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Scanning r2:// needs CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY. See .env.example.");
  }
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const q = new URLSearchParams({ "list-type": "2", prefix });
    if (token) q.set("continuation-token", token);
    const res = await client.fetch(`${base}?${q}`);
    if (!res.ok) throw new Error(`R2 list failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    const page = parseListObjects(await res.text());
    keys.push(...page.keys.filter((k) => IMAGE_EXT.test(basename(k))));
    token = page.nextToken;
  } while (token && (limit === undefined || keys.length < limit));

  return keys.map((key) => ({
    name: `r2://${bucket}/${key}`,
    async load() {
      const res = await client.fetch(`${base}/${key.split("/").map(encodeURIComponent).join("/")}`);
      if (!res.ok) throw new Error(`R2 get failed (HTTP ${res.status}) for ${key}`);
      return Buffer.from(await res.arrayBuffer());
    },
  }));
}

export async function resolveSource(source: string, limit?: number): Promise<PhotoSource[]> {
  if (source.startsWith("r2://")) return r2Source(source, limit);
  const { stat } = await import("node:fs/promises");
  const info = await stat(source).catch(() => null);
  if (!info) throw new Error(`Source not found: ${source}`);
  if (info.isDirectory()) return folderSource(source);
  return urlListSource(parseUrlList(await readFile(source, "utf8")));
}
