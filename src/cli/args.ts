export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | true>;
}

const BOOLEAN_FLAGS = new Set(["json", "help"]);

/** Tiny argv parser: `--flag`, `--key value` and `--key=value`. Boolean flags never take a value. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "-h") {
      flags.help = true;
    } else if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (eq !== -1) flags[name] = arg.slice(eq + 1);
      else if (BOOLEAN_FLAGS.has(name)) flags[name] = true;
      else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) throw new Error(`Option --${name} needs a value.`);
        flags[name] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

export function intFlag(flags: ParsedArgs["flags"], name: string): number | undefined {
  const v = flags[name];
  if (v === undefined) return undefined;
  const n = Number(v);
  if (typeof v !== "string" || !Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a whole number of 1 or more.`);
  return n;
}

export function intListFlag(flags: ParsedArgs["flags"], name: string): number[] | undefined {
  const v = flags[name];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error(`--${name} needs a value, for example 1,2.`);
  const list = v.split(",").map((s) => Number(s.trim()));
  if (list.some((n) => !Number.isInteger(n) || n < 1)) throw new Error(`--${name} must be a comma-separated list of whole numbers.`);
  return list;
}
