import { describe, expect, it } from "vitest";
import { classify } from "../src/core/classify.js";
import type { ClassifyInput } from "../src/core/types.js";

const base: ClassifyInput = { real: 0.95, face: 0.95, subject: "person", subjectConfidence: 0.95, wholeFace: 0.95, multiplePeople: 0.05 };
const c = (o: Partial<ClassifyInput>) => classify({ ...base, ...o });

describe("classify rule 1: real photo", () => {
  it("rejects real below 0.3", () => expect(c({ real: 0.29 })).toBe("not_a_person"));
  it("does not reject at exactly 0.3", () => expect(c({ real: 0.3, face: 0.5 })).toBe("check_by_hand"));
});

describe("classify rule 2: non-person subject", () => {
  const animal = { subject: "animal", face: 0.25, real: 0.9 };
  it("rejects a confident non-person with no face", () => expect(c({ ...animal, subjectConfidence: 0.6 })).toBe("not_a_person"));
  it("needs confidence of at least 0.6", () => expect(c({ ...animal, subjectConfidence: 0.59 })).toBe("check_by_hand"));
  it("needs face below 0.3", () => expect(c({ ...animal, subjectConfidence: 0.9, face: 0.3 })).toBe("check_by_hand"));
  it("accepts face 0.29", () => expect(c({ ...animal, subjectConfidence: 0.9, face: 0.29 })).toBe("not_a_person"));
  it("ignores a confident person subject", () => expect(c({ face: 0.25, subjectConfidence: 1 })).toBe("check_by_hand"));
});

describe("classify rules 3 and 4: ok", () => {
  it("is ok with real and face at 0.7", () => expect(c({ real: 0.7, face: 0.7 })).toBe("ok"));
  it("is not ok with real 0.69", () => expect(c({ real: 0.69 })).toBe("check_by_hand"));
  it("is not ok with face 0.69", () => expect(c({ face: 0.69 })).toBe("check_by_hand"));
});

describe("classify framing (version 2)", () => {
  it("whole_face 0.5 is fine", () => expect(c({ wholeFace: 0.5 })).toBe("ok"));
  it("whole_face 0.49 goes to a person", () => expect(c({ wholeFace: 0.49 })).toBe("check_by_hand"));
  it("multiple_people 0.7 goes to a person", () => expect(c({ multiplePeople: 0.7 })).toBe("check_by_hand"));
  it("multiple_people 0.69 is fine", () => expect(c({ multiplePeople: 0.69 })).toBe("ok"));
  it("framing never rejects on its own", () => {
    expect(c({ wholeFace: 0, multiplePeople: 1 })).toBe("check_by_hand");
  });
  it("a framing issue with a face below 0.2 is face_not_clear", () => expect(c({ face: 0.19, wholeFace: 0.1 })).toBe("face_not_clear"));
});

describe("classify rule 5: face_not_clear", () => {
  it("face 0.19 is face_not_clear", () => expect(c({ face: 0.19 })).toBe("face_not_clear"));
  it("face 0.2 is check_by_hand", () => expect(c({ face: 0.2 })).toBe("check_by_hand"));
});

describe("classify with version 1 scores", () => {
  const v1 = { real: 0.95, face: 0.95, subject: "person", subjectConfidence: 0.9 };
  it("ignores framing when the answers are missing", () => expect(classify(v1)).toBe("ok"));
  it("still sends middling scores to a person", () => expect(classify({ ...v1, face: 0.5 })).toBe("check_by_hand"));
});
