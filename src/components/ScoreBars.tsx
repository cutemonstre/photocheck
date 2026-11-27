import type { Scores } from "../lib/api";
import { Bar } from "./ui";

export function ScoreBars({ scores }: { scores: Scores }) {
  return (
    <div className="grid gap-3">
      <Bar label="Real photograph" value={scores.real} />
      <Bar label="Face clearly visible" value={scores.face} />
      {scores.wholeFace !== undefined && <Bar label="Whole face in frame" value={scores.wholeFace} />}
      {scores.multiplePeople !== undefined && <Bar label="More than one person" value={scores.multiplePeople} />}
      <p className="text-sm text-muted">
        Main subject: <span className="num text-fg">{scores.subject.replaceAll("_", " ")}</span>{" "}
        <span className="num">({scores.subjectConfidence.toFixed(2)})</span>
      </p>
    </div>
  );
}
