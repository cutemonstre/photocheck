import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "../components/Check";
import { Review } from "../components/Review";

export const Route = createFileRoute("/")({ component: Home });

const TABS = [
  ["check", "Check"],
  ["review", "Review"],
] as const;

const links = [
  ["Cloudflare Workers", "https://developers.cloudflare.com/workers/"],
  ["Workers AI (Clef)", "https://developers.cloudflare.com/workers-ai/models/clef/"],
  ["R2", "https://developers.cloudflare.com/r2/"],
  ["D1", "https://developers.cloudflare.com/d1/"],
  ["TanStack Start", "https://tanstack.com/start"],
] as const;

function Home() {
  const [tab, setTab] = useState<"check" | "review">("check");
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">photocheck</h1>
        <p className="mt-1 text-muted">Smart validation for photo uploads. Checks that a photo is the right kind of photo, not only an image.</p>
      </header>

      <div role="tablist" aria-label="Sections" className="mb-6 flex gap-1 border-b border-line">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            id={`tab-${k}`}
            role="tab"
            type="button"
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            onClick={() => setTab(k)}
            className={`-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm font-medium ${
              tab === k ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="grow">
        {/* Both panels stay mounted so the Check results survive a switch to Review. */}
        <div role="tabpanel" id="panel-check" aria-labelledby="tab-check" hidden={tab !== "check"}>
          <Check />
        </div>
        {tab === "review" && (
          <div role="tabpanel" id="panel-review" aria-labelledby="tab-review">
            <Review />
          </div>
        )}
      </main>

      <footer className="mt-12 border-t border-line pt-5 text-sm text-muted">
        <p>
          Built with{" "}
          {links.map(([name, href], i) => (
            <span key={href}>
              <a href={href} className="underline underline-offset-2 hover:text-fg" target="_blank" rel="noreferrer">
                {name}
              </a>
              {i < links.length - 2 ? ", " : i === links.length - 2 ? " and " : "."}
            </span>
          ))}
        </p>
        <p className="mt-1">
          <a href="https://github.com/cutemonstre/photocheck" className="underline underline-offset-2 hover:text-fg">
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
