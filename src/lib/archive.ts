/** Archive helpers: imported and restored conversations are read-only; they can be viewed, searched,
 *  and used as the starting context of a new chat. */

import { MAX_TEXT_BYTES } from "./attachments";
import type { ChatItem } from "./types";

export interface ArchiveEntry {
  id: string;
  title: string;
  source: string;
  created: number | null;
  updated: number | null;
  messages: number;
  imported_at: number;
}

export interface ArchiveMessage {
  role: "user" | "assistant";
  text: string;
  at?: number | null;
}

export interface ArchiveDoc {
  messages: ArchiveMessage[];
  items?: ChatItem[] | null;
}

export const SOURCE_LABELS: Record<string, string> = {
  "claude.ai": "Claude.ai",
  chatgpt: "ChatGPT",
  "better-claude-ui": "BetterClaudeUI backup",
  universal: "Universal export",
  markdown: "Markdown file",
  other: "Other",
};

export const sourceLabel = (s: string): string => SOURCE_LABELS[s] ?? s;

/** Items to render: the original ones (restored backups keep tool cards), else built from messages. */
export function archiveItems(doc: ArchiveDoc): ChatItem[] {
  if (doc.items && doc.items.length > 0) return doc.items;
  return doc.messages.map((m, i) =>
    m.role === "user"
      ? { kind: "user", id: `a${i}`, text: m.text }
      : { kind: "assistant", id: `a${i}`, text: m.text, streaming: false, nested: false },
  );
}

/** Case-insensitive filter over title and source; empty query keeps everything. */
export function filterArchive(entries: ArchiveEntry[], query: string, source: string | null): ArchiveEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => (!source || e.source === source) && (!q || e.title.toLowerCase().includes(q) || sourceLabel(e.source).toLowerCase().includes(q)));
}

export function sourcesIn(entries: ArchiveEntry[]): string[] {
  return [...new Set(entries.map((e) => e.source))].sort();
}

export function dateLabel(unixSeconds: number | null): string {
  return unixSeconds ? new Date(unixSeconds * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
}

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

/** A conversation as Markdown, the same shape the app exports. */
export function transcriptMarkdown(title: string, source: string, messages: ArchiveMessage[]): string {
  const head = `# ${title}\n\n_Earlier conversation from ${sourceLabel(source)}_\n\n`;
  return head + messages.map((m) => `## ${m.role === "user" ? "You" : "Assistant"}\n\n${m.text.trim()}\n`).join("\n");
}

export interface ContinueContext {
  /** Text of the attachment to send. */
  transcript: string;
  /** How many of the oldest messages had to be left out to fit the attachment limit. */
  omitted: number;
  /** The message to send with it. */
  message: string;
}

/** Context for continuing in a new chat. The attachment limit is about 200 KB, so a long conversation
 *  keeps its MOST RECENT messages and says how many were left out. */
export function continueContext(title: string, source: string, messages: ArchiveMessage[], maxBytes = MAX_TEXT_BYTES - 2000): ContinueContext {
  let kept = messages;
  let omitted = 0;
  while (kept.length > 1 && bytes(transcriptMarkdown(title, source, kept)) > maxBytes) {
    // Drop from the front in growing steps so very long conversations don't loop slowly.
    const step = Math.max(1, Math.floor(kept.length / 10));
    kept = kept.slice(step);
    omitted += step;
  }
  let transcript = transcriptMarkdown(title, source, kept);
  if (bytes(transcript) > maxBytes) transcript = transcript.slice(0, Math.floor(maxBytes / 4)) + "\n\n[…the rest of this very long message was left out]";
  if (omitted > 0) transcript = transcript.replace("\n\n", `\n\n_The ${omitted} oldest message${omitted === 1 ? " was" : "s were"} left out to fit. Only the most recent part follows._\n\n`);
  const message = `I'm continuing a conversation I had earlier on ${sourceLabel(source)}${omitted ? " (only the most recent part is included)" : ""}. The transcript is attached. Please read it, then tell me in two or three sentences where we left off, and wait for my next message.`;
  return { transcript, omitted, message };
}
