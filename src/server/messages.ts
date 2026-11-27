import type { Status } from "../core/types.js";

export type GateStatus = Exclude<Status, "unreadable"> | "not_checked";

/** Plain-language text shown to the person uploading. */
export const MESSAGES: Record<GateStatus, string> = {
  ok: "Thanks. Your photo looks good.",
  check_by_hand: "Thanks. Your photo was saved. A person will take a quick look at it.",
  not_a_person: "We can't see a person in this photo. Please upload a real photo of your own face.",
  face_not_clear: "We can't see a face in this photo. Please upload a clear photo of your own face.",
  not_checked: "Thanks. Your photo was saved. We could not check it automatically, so a person will look at it.",
};

export const REJECTED: ReadonlySet<GateStatus> = new Set(["not_a_person", "face_not_clear"]);
export const ALL_GATE_STATUSES: readonly GateStatus[] = ["ok", "check_by_hand", "not_a_person", "face_not_clear", "not_checked"];
