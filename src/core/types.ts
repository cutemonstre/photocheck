/** Result of checking one photo. `unreadable` is set by the CLI when conversion fails; classify() never returns it. */
export type Status = "ok" | "not_a_person" | "face_not_clear" | "check_by_hand" | "unreadable";

export const STATUSES: readonly Status[] = ["ok", "not_a_person", "face_not_clear", "check_by_hand", "unreadable"];

/** Probabilities (0 to 1) read from Clef's answers for one photo. */
export interface Scores {
  /** Yes-probability: a real camera photograph. */
  real: number;
  /** Yes-probability: a human face is clearly visible. */
  face: number;
  /** Most likely main subject (a key of the `subject` question's criteria). */
  subject: string;
  /** Confidence in `subject`, 0 to 1. */
  subjectConfidence: number;
  /** Only present from question version 2. */
  wholeFace?: number;
  /** Only present from question version 2. */
  multiplePeople?: number;
  questionsVersion: number;
  inputTokens: number;
}

export type ClassifyInput = Pick<Scores, "real" | "face" | "subject" | "subjectConfidence" | "wholeFace" | "multiplePeople">;
