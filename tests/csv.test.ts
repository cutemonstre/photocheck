import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "../src/core/csv.js";

describe("csvEscape", () => {
  it("leaves plain text alone", () => expect(csvEscape("photo.jpg")).toBe("photo.jpg"));
  it("quotes commas", () => expect(csvEscape("a,b")).toBe('"a,b"'));
  it("doubles quotes", () => expect(csvEscape('say "hi"')).toBe('"say ""hi"""'));
  it("quotes newlines", () => expect(csvEscape("a\nb")).toBe('"a\nb"'));
  it("renders null and undefined as empty", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
  it("keeps numbers as they are", () => expect(csvEscape(-0.5)).toBe("-0.5"));
  it("defuses spreadsheet formulas in text", () => expect(csvEscape("=SUM(A1)")).toBe("'=SUM(A1)"));
});

describe("toCsv", () => {
  it("writes a header and rows", () => {
    expect(toCsv(["a", "b"], [{ a: 1, b: "x,y" }, { a: 2 }])).toBe('a,b\n1,"x,y"\n2,\n');
  });
});
