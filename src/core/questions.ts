/**
 * THE file to edit when you want to change what photocheck asks or how strict it is.
 * The shipped preset is "profile photo". Rewrite the state and questions for product photos,
 * document scans, listings or any other kind of upload.
 *
 * To change behaviour: add a new version to QUESTION_SETS, point CURRENT_VERSION at it,
 * then run `photocheck eval <folder>` to compare it with the old version on your labelled photos.
 * Never edit an old version in place. Old versions stay so `eval` can compare against them.
 */

export type QuestionDef =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };

export type QuestionSet = Record<string, QuestionDef>;

/** Context sentence sent with every photo. */
export const STATE =
  "A profile photo a member uploaded. It should be a real photo of the member's own face.";

const V1: QuestionSet = {
  real_photo: {
    type: "noul",
    instructions:
      "Is the image a real camera photograph, not a cartoon, drawing, illustration, painting, emoji, logo, generic avatar icon or AI-generated character?",
  },
  face_visible: {
    type: "noul",
    instructions: "Is a real human's face clearly visible in the image (eyes, nose and mouth can be seen)?",
  },
  subject: {
    type: "choice",
    instructions: "What is the main subject of the image?",
    criteria: {
      person: "a real human being",
      animal: "an animal or pet",
      object_or_scene: "an object, vehicle, food, landscape or place with no person",
      cartoon_or_drawing: "a cartoon, drawing, illustration, anime, emoji or avatar icon",
      text_or_logo: "mostly text, a logo, a screenshot or a document",
    },
  },
};

const V2: QuestionSet = {
  ...V1,
  whole_face: {
    type: "noul",
    instructions:
      "Is the person's whole face inside the photo, from forehead to chin, not cut off at the edges and not an extreme close-up of part of the face?",
  },
  multiple_people: {
    type: "noul",
    instructions:
      "Are two or more people shown prominently, so it is unclear which one is the member? Ignore people who are small, far away or in the background.",
  },
};

export const QUESTION_SETS: Readonly<Record<number, QuestionSet>> = { 1: V1, 2: V2 };

/** The version used by the Worker and, by default, the CLI. */
export const CURRENT_VERSION = 2;

export function getQuestions(version: number): QuestionSet {
  const set = QUESTION_SETS[version];
  if (!set) {
    const known = Object.keys(QUESTION_SETS).join(", ");
    throw new Error(`Unknown questions version ${version}. Known versions: ${known}.`);
  }
  return set;
}

export function listVersions(): number[] {
  return Object.keys(QUESTION_SETS).map(Number).sort((a, b) => a - b);
}

/**
 * Thresholds used by classify(). Probabilities are 0 to 1.
 * Design principle: the framing questions (whole_face, multiple_people) can only send a photo
 * to a human (`check_by_hand`). They never reject on their own.
 */
export const THRESHOLDS = {
  /** real below this: not a real photograph, so not a person. */
  notRealBelow: 0.3,
  /** subject must be a non-person with at least this confidence ... */
  subjectConfidenceAtLeast: 0.6,
  /** ... and face below this, to be called not a person. */
  noFaceBelow: 0.3,
  /** whole_face below this: framing issue (human check). */
  wholeFaceBelow: 0.5,
  /** multiple_people at or above this: framing issue (human check). */
  multiplePeopleAtLeast: 0.7,
  /** real and face at or above this (and no framing issue): ok. */
  okAtLeast: 0.7,
  /** face below this: the face is not clear. */
  faceNotClearBelow: 0.2,
} as const;

/** Workers AI price for Clef, US dollars per million input tokens. Output is free. */
export const PRICE_PER_MILLION_INPUT_TOKENS = 0.24;

export function estimateCost(inputTokens: number): number {
  return (inputTokens / 1_000_000) * PRICE_PER_MILLION_INPUT_TOKENS;
}
