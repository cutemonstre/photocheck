import { describe, expect, it } from "vitest";
import { expectedList, scoreRows, statusChanges, type EvalRow } from "../src/core/evaluate.js";

const row = (file: string, expected: EvalRow["expected"], actual: EvalRow["actual"]): EvalRow => ({ file, expected, actual });

describe("scoreRows", () => {
  const rows = [
    row("a", ["ok"], "ok"),
    row("b", ["ok", "check_by_hand"], "check_by_hand"),
    row("c", ["not_a_person"], "ok"),
    row("d", ["face_not_clear", "check_by_hand"], "not_a_person"),
  ];
  const s = scoreRows(rows);
  it("counts a hit on any acceptable status", () => {
    expect(s.correct).toBe(2);
    expect(s.total).toBe(4);
    expect(s.accuracy).toBe(0.5);
  });
  it("lists the misses", () => expect(s.misses.map((m) => m.file)).toEqual(["c", "d"]));
  it("files hits under the status they got", () => {
    expect(s.confusion.ok!.ok).toBe(1);
    expect(s.confusion.check_by_hand!.check_by_hand).toBe(1);
  });
  it("files misses under the first expected status", () => {
    expect(s.confusion.not_a_person!.ok).toBe(1);
    expect(s.confusion.face_not_clear!.not_a_person).toBe(1);
  });
  it("gives 0 accuracy for no rows", () => expect(scoreRows([]).accuracy).toBe(0));
});

describe("expectedList", () => {
  it("wraps a single status", () => expect(expectedList("ok")).toEqual(["ok"]));
  it("keeps an array", () => expect(expectedList(["ok", "check_by_hand"])).toEqual(["ok", "check_by_hand"]));
});

describe("statusChanges", () => {
  it("lists only photos whose status differs between versions", () => {
    const changes = statusChanges({
      1: { a: "ok", b: "ok", c: "check_by_hand" },
      2: { a: "ok", b: "check_by_hand", c: "check_by_hand" },
    });
    expect(changes).toEqual([{ file: "b", statuses: { 1: "ok", 2: "check_by_hand" } }]);
  });
  it("returns nothing for one version", () => expect(statusChanges({ 1: { a: "ok" } })).toEqual([]));
});
