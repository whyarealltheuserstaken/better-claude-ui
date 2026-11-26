/** The tool actions of a conversation, for the right panel. Pure. */
import { summarizeTool } from "./tools";
import type { ChatItem, PendingPermission } from "./types";

export interface ActivityEntry {
  id: string;
  summary: string;
  status: "running" | "waiting" | "done" | "error";
  nested: boolean;
}

export function activityFrom(items: ChatItem[], pending: PendingPermission[]): ActivityEntry[] {
  const waiting = new Set(pending.map((p) => p.tool_use_id));
  return items.flatMap((i) => (i.kind === "tool" ? [{ id: i.id, summary: summarizeTool(i.name, i.input), status: waiting.has(i.id) ? ("waiting" as const) : i.status, nested: i.nested }] : []));
}
