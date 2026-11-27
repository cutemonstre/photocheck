import { CURRENT_VERSION, getQuestions, STATE, THRESHOLDS as T } from "../core/questions";

const KEY_LABEL: Record<string, string> = {
  real_photo: "real",
  face_visible: "face",
  subject: "subject",
  whole_face: "whole_face",
  multiple_people: "multiple_people",
};
const f = (n: number) => n.toFixed(1);

/** Built from src/core/questions.ts. The rule wording mirrors classify.ts; keep the two in step. */
export function HowItDecides() {
  const questions = Object.entries(getQuestions(CURRENT_VERSION));
  const rules = [
    [`real < ${f(T.notRealBelow)}`, "Not a person"],
    [`subject is not person, its confidence is at least ${f(T.subjectConfidenceAtLeast)} and face < ${f(T.noFaceBelow)}`, "Not a person"],
    [
      `real >= ${f(T.okAtLeast)}, face >= ${f(T.okAtLeast)} and no framing issue (whole_face < ${f(T.wholeFaceBelow)} or multiple_people >= ${f(T.multiplePeopleAtLeast)})`,
      "OK",
    ],
    [`face < ${f(T.faceNotClearBelow)}`, "Face not clear"],
    ["anything else", "Check by hand"],
  ];
  return (
    <details className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">How it decides</summary>
      <div className="grid gap-5 border-t border-line px-4 py-4 text-sm">
        <p className="text-muted">
          Context sent with every photo: <q>{STATE}</q> Clef returns a probability for each question. Question set version{" "}
          <span className="num">{CURRENT_VERSION}</span>.
        </p>
        <div>
          <h3 className="mb-2 font-semibold">Questions</h3>
          <ul className="grid gap-2">
            {questions.map(([key, q]) => (
              <li key={key}>
                <span className="num rounded bg-track px-1.5 py-0.5 text-xs">{KEY_LABEL[key] ?? key}</span>{" "}
                {q.instructions}
                {q.type === "choice" && (
                  <span className="text-muted"> Options: {Object.keys(q.criteria).join(", ").replaceAll("_", " ")}.</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 font-semibold">Rules, in order. The first match wins.</h3>
          <ol className="grid list-decimal gap-1.5 pl-5">
            {rules.map(([cond, status], i) => (
              <li key={i}>
                <span className="num">{cond}</span> <span className="text-muted">gives</span> <strong>{status}</strong>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-muted">Framing questions can only send a photo to a person. They never reject on their own.</p>
        </div>
      </div>
    </details>
  );
}
