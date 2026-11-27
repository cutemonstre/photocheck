#!/usr/bin/env node
import { CURRENT_VERSION, getQuestions, STATE, THRESHOLDS } from "../core/questions.js";
import { parseArgs } from "./args.js";
import { loadDotEnv } from "./env.js";
import { runEval } from "./eval.js";
import { runScan } from "./scan.js";

const HELP = `photocheck: smart validation for photo uploads with Cloudflare Clef

Usage:
  photocheck scan <folder | urls.txt | r2://bucket/prefix> [options]
      --limit N                 only check the first N photos
      --questions-version N     question set to use (default: current)
      --out FILE                CSV output (default: photocheck-results.csv)
      --json                    print JSON instead of text
  photocheck eval <folder> [options]
      folder holds images and labels.json
      --versions 1,2            question versions to compare (default: all)
      --json                    print JSON instead of text
  photocheck questions          print the current state, questions and thresholds

Environment (or a local .env file):
  CLOUDFLARE_ACCOUNT_ID, WORKERS_AI_API_TOKEN
  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY    (only for r2:// sources)`;

function printQuestions(): void {
  console.log(`Questions version ${CURRENT_VERSION} (current)\n\nState:\n  ${STATE}\n\nQuestions:`);
  console.log(JSON.stringify(getQuestions(CURRENT_VERSION), null, 2));
  console.log("\nThresholds:");
  console.log(JSON.stringify(THRESHOLDS, null, 2));
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (!command || command === "help" || command === "--help" || command === "-h" || args.flags.help) {
    console.log(HELP);
    return command ? 0 : 1;
  }
  loadDotEnv();
  switch (command) {
    case "scan":
      return runScan(args);
    case "eval":
      return runEval(args);
    case "questions":
      printQuestions();
      return 0;
    default:
      console.error(`Unknown command: ${command}\n\n${HELP}`);
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  },
);
