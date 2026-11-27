/** Quote a CSV field when it holds a comma, quote, CR or LF. Also neutralises spreadsheet formulas. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // A leading = + - @ can run as a formula when the CSV is opened in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s) && typeof value === "string") s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const lines = [columns.map(csvEscape).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvEscape(row[c])).join(","));
  return lines.join("\n") + "\n";
}
