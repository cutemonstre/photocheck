import { useState } from "react";
import { setToken } from "../lib/api";
import { btnPrimary } from "./ui";

/** Shown after a 401. The token stays in memory and is gone on reload. */
export function TokenField({ onSubmit }: { onSubmit?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        setToken(value);
        onSubmit?.();
      }}
    >
      <div className="grow">
        <label htmlFor="token" className="block text-sm font-medium">
          This server needs a token
        </label>
        <p className="text-sm text-muted">It is kept in memory only and is forgotten when you reload.</p>
        <input
          id="token"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm"
        />
      </div>
      <button type="submit" className={btnPrimary}>
        Use token
      </button>
    </form>
  );
}
