/** Starting a session from the Home message box. The steps are passed in, so this stays testable. */
import type { PendingAttachment } from "./attachments";
import type { Mode } from "./types";

export interface HomeDraft {
  text: string;
  attachments: PendingAttachment[];
  mode: Mode;
  projectId: string | null;
  projectCwd: string | null;
}

export interface HomeDeps {
  pickFolder(): Promise<string | null>;
  start(mode: Mode, o: { cwd: string | null; projectId: string | null }): Promise<string | null>;
  send(text: string, attachments: PendingAttachment[]): Promise<boolean>;
}

export type HomeResult = "sent" | "cancelled" | "failed";

export async function startFromHome(deps: HomeDeps, draft: HomeDraft): Promise<HomeResult> {
  let cwd: string | null = null;
  if (draft.mode === "code") {
    // Ask before starting anything, so cancelling leaves the person exactly where they were.
    cwd = draft.projectCwd ?? (await deps.pickFolder());
    if (!cwd) return "cancelled";
  }
  const id = await deps.start(draft.mode, { cwd, projectId: draft.projectId });
  if (!id) return "failed";
  return (await deps.send(draft.text, draft.attachments)) ? "sent" : "failed";
}
