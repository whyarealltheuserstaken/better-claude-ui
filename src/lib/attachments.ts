/** Composer attachments: classification, limits, and how they are sent. */

export type AttachmentKind = "image" | "pdf" | "text";

export interface PendingAttachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  media_type: string;
  size: number;
  /** Base64 (no prefix) for images and PDFs. */
  data?: string;
  /** File contents for text attachments. */
  text?: string;
  /** Object/data URL for image thumbnails. */
  preview?: string;
}

export const MAX_FILES = 10;
export const MAX_BINARY_BYTES = 7 * 1024 * 1024;
export const MAX_TEXT_BYTES = 200 * 1024;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "jsonl", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rs", "go", "java", "kt", "c", "h",
  "cpp", "hpp", "cs", "rb", "php", "swift", "html", "htm", "css", "scss", "svelte", "vue", "yaml", "yml", "toml", "ini", "cfg",
  "sh", "bash", "ps1", "bat", "csv", "tsv", "log", "xml", "sql", "env", "gitignore", "dockerfile", "lock",
]);

const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : name.toLowerCase());

export type Classified = { ok: true; kind: AttachmentKind; media_type: string } | { ok: false; error: string };

export function classify(name: string, mime: string, size: number): Classified {
  if (IMAGE_TYPES.includes(mime)) {
    return size > MAX_BINARY_BYTES ? { ok: false, error: `${name} is larger than ${fmtSize(MAX_BINARY_BYTES)}.` } : { ok: true, kind: "image", media_type: mime };
  }
  if (mime === "application/pdf" || ext(name) === "pdf") {
    return size > MAX_BINARY_BYTES ? { ok: false, error: `${name} is larger than ${fmtSize(MAX_BINARY_BYTES)}.` } : { ok: true, kind: "pdf", media_type: "application/pdf" };
  }
  if (mime.startsWith("text/") || TEXT_EXT.has(ext(name))) {
    return size > MAX_TEXT_BYTES
      ? { ok: false, error: `${name} is over ${fmtSize(MAX_TEXT_BYTES)}. In a Code session, ask Claude to read it from your project instead.` }
      : { ok: true, kind: "text", media_type: "text/plain" };
  }
  return { ok: false, error: `${name}: this file type can't be attached. Images, PDFs and text or code files work.` };
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** The message text actually sent: the typed text plus any text files, inlined and labelled. */
export function composeText(text: string, atts: PendingAttachment[]): string {
  const parts: string[] = [];
  if (text.trim()) parts.push(text);
  for (const a of atts) {
    if (a.kind !== "text" || a.text === undefined) continue;
    // Use a fence longer than any backtick run inside the file so it cannot break out.
    const longest = Math.max(2, ...[...a.text.matchAll(/`+/g)].map((m) => m[0].length));
    const fence = "`".repeat(longest + 1);
    parts.push(`Attached file: ${a.name}\n${fence}\n${a.text}\n${fence}`);
  }
  return parts.join("\n\n");
}

/** Images and PDFs, in the shape the Rust side expects. */
export function toWire(atts: PendingAttachment[]): { name: string; media_type: string; data: string }[] {
  return atts.filter((a) => a.kind !== "text" && a.data).map((a) => ({ name: a.name, media_type: a.media_type, data: a.data! }));
}

/** Can another file be added? Returns an error message or null. */
export function canAdd(current: PendingAttachment[], extra = 1): string | null {
  return current.length + extra > MAX_FILES ? `You can attach up to ${MAX_FILES} files per message.` : null;
}

export function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.readAsDataURL(file);
  });
}

export function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.onload = () => resolve(String(r.result));
    r.readAsText(file);
  });
}

let counter = 0;

/** Read a browser File into a PendingAttachment, or return an error message. */
export async function fromFile(file: File): Promise<PendingAttachment | { error: string }> {
  const c = classify(file.name || "pasted", file.type, file.size);
  if (!c.ok) return { error: c.error };
  const base = { id: `att${++counter}`, name: file.name || (c.kind === "image" ? "pasted-image.png" : "file"), kind: c.kind, media_type: c.media_type, size: file.size };
  if (c.kind === "text") return { ...base, text: await readAsText(file) };
  const data = await readAsBase64(file);
  return { ...base, data, preview: c.kind === "image" ? `data:${c.media_type};base64,${data}` : undefined };
}
