import { THRESHOLDS as T } from "./questions.js";
import type { ClassifyInput, Status } from "./types.js";

/**
 * Turn Clef's probabilities into a status. Rules run in this order, first match wins.
 *
 * The framing questions (whole_face, multiple_people) can only move a photo to `check_by_hand`.
 * They never reject a photo on their own. With question version 1 they are undefined,
 * so framing never triggers.
 */
export function classify(s: ClassifyInput): Exclude<Status, "unreadable"> {
  if (s.real < T.notRealBelow) return "not_a_person";
  if (s.subject !== "person" && s.subjectConfidence >= T.subjectConfidenceAtLeast && s.face < T.noFaceBelow) {
    return "not_a_person";
  }
  const framingIssue = (s.wholeFace ?? 1) < T.wholeFaceBelow || (s.multiplePeople ?? 0) >= T.multiplePeopleAtLeast;
  if (s.real >= T.okAtLeast && s.face >= T.okAtLeast && !framingIssue) return "ok";
  if (s.face < T.faceNotClearBelow) return "face_not_clear";
  return "check_by_hand";
}
