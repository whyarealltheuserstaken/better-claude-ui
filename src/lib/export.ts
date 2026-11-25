import { summarizeTool } from "./tools";
import type { ChatItem } from "./types";

/** A conversation as Markdown: your messages, Claude's replies, and one line per tool action. */
export function exportMarkdown(title: string, items: ChatItem[]): string {
  const out: string[] = [`# ${title.trim() || "Conversation"}`, ""];
  for (const it of items) {
    switch (it.kind) {
      case "user": {
        out.push("## You", "", it.text);
        if (it.attachments?.length) out.push("", `_Attached: ${it.attachments.map((a) => a.name).join(", ")}_`);
        out.push("");
        break;
      }
      case "assistant":
        if (it.text.trim()) out.push(it.nested ? "> (helper) " + it.text.replace(/\n/g, "\n> ") : it.text, "");
        break;
      case "tool":
        out.push(`- ${summarizeTool(it.name, it.input)} (${it.status === "error" ? "failed" : it.status === "running" ? "not finished" : "done"})`);
        break;
      case "notice":
        out.push(`> ${it.level === "error" ? "Error" : "Note"}: ${it.text}`, "");
        break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Plain text of one message, for the Copy button. */
export function itemText(it: ChatItem): string {
  if (it.kind === "user" || it.kind === "assistant" || it.kind === "notice") return it.text;
  return summarizeTool(it.name, it.input);
}
