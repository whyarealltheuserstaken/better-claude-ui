/** Plain-language summaries of tool calls, for the transcript and permission prompts. */

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function summarizeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Write":
      return `Create ${base(str(input.file_path)) || "a file"}`;
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return `Edit ${base(str(input.file_path) || str(input.notebook_path)) || "a file"}`;
    case "Read":
      return `Read ${base(str(input.file_path)) || "a file"}`;
    case "Bash":
    case "PowerShell":
      return `Run ${clip(str(input.command) || "a command")}`;
    case "Glob":
      return `Find files matching ${clip(str(input.pattern))}`;
    case "Grep":
      return `Search for ${clip(str(input.pattern))}`;
    case "WebFetch":
      return `Fetch ${clip(str(input.url))}`;
    case "WebSearch":
      return `Search the web for ${clip(str(input.query))}`;
    case "Task":
    case "Agent":
      return `Delegate: ${clip(str(input.description) || str(input.prompt) || "sub-task")}`;
    default:
      return name.startsWith("mcp__") ? `Use ${name.split("__").slice(1).join(" › ")}` : `Use ${name}`;
  }
}

/** Why a permission prompt matters, in words a beginner can act on. */
export function explainRisk(name: string): string {
  switch (name) {
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return "This changes a file on your computer.";
    case "Bash":
    case "PowerShell":
      return "This runs a command on your computer.";
    case "WebFetch":
    case "WebSearch":
      return "This reaches out to the internet.";
    default:
      return "Claude wants to use this tool.";
  }
}

export function truncateLines(text: string, max: number): { text: string; truncated: boolean; total: number } {
  const lines = text.split("\n");
  if (lines.length <= max) return { text, truncated: false, total: lines.length };
  return { text: lines.slice(0, max).join("\n"), truncated: true, total: lines.length };
}

export interface DiffLine {
  sign: "+" | "-";
  text: string;
}

/** A simple before/after view for Edit, MultiEdit and Write inputs; null for other tools. */
export function diffLines(name: string, input: Record<string, unknown>): DiffLine[] | null {
  const lines = (s: unknown, sign: "+" | "-"): DiffLine[] =>
    typeof s === "string" && s !== "" ? s.split("\n").map((text) => ({ sign, text })) : [];
  if (name === "Edit") return [...lines(input.old_string, "-"), ...lines(input.new_string, "+")];
  if (name === "MultiEdit" && Array.isArray(input.edits)) {
    return input.edits.flatMap((e: Record<string, unknown>) => [...lines(e.old_string, "-"), ...lines(e.new_string, "+")]);
  }
  if (name === "Write") return lines(input.content, "+");
  return null;
}
