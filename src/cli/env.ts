import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Parse the text of a .env file: KEY=value lines, # comments, optional quotes. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** Load ./.env into process.env. Variables already set in the environment win. */
export function loadDotEnv(dir = process.cwd()): void {
  const file = resolve(dir, ".env");
  if (!existsSync(file)) return;
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (process.env[k] === undefined && v !== "") process.env[k] = v;
  }
}

export interface Credentials {
  accountId: string;
  token: string;
}

export function requireCredentials(): Credentials {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.WORKERS_AI_API_TOKEN;
  if (!accountId || !token) {
    throw new Error(
      [
        "Missing Cloudflare credentials.",
        "",
        "Setup:",
        "  1. Copy .env.example to .env",
        "  2. Set CLOUDFLARE_ACCOUNT_ID (Cloudflare dashboard, account overview)",
        "  3. Create an API token with the Workers AI permission and set WORKERS_AI_API_TOKEN",
        "",
        "You can also export both variables in your shell instead of using .env.",
      ].join("\n"),
    );
  }
  return { accountId, token };
}
