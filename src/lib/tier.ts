/** What each experience tier shows and allows (design §8). Pure, so it is easy to test. */
export type Tier = "beginner" | "intermediate" | "advanced";

export const TIERS: { id: Tier; label: string; blurb: string }[] = [
  { id: "beginner", label: "Beginner", blurb: "Clean chat. Claude asks before anything risky, and actions are explained in plain language." },
  { id: "intermediate", label: "Intermediate", blurb: "Adds file diffs, a model picker and a permission-mode picker." },
  { id: "advanced", label: "Advanced", blurb: "Adds the raw event log, extra CLI flags and every permission mode (bypass needs a confirmation)." },
];

export interface Caps {
  modelPicker: boolean;
  modePicker: boolean;
  permissionModes: string[];
  diffs: boolean;
  rawLog: boolean;
  extraArgs: boolean;
  presetEditor: boolean;
}

export const MODELS: { id: string; label: string }[] = [
  { id: "", label: "Default" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];

export const PERMISSION_MODES: { id: string; label: string; help: string }[] = [
  { id: "default", label: "Ask first", help: "Asks before editing files or running commands." },
  { id: "acceptEdits", label: "Auto-accept edits", help: "Edits files without asking; still asks for commands." },
  { id: "plan", label: "Plan only", help: "Claude researches and proposes a plan without changing anything." },
  { id: "bypassPermissions", label: "Bypass all (dangerous)", help: "Runs everything without asking. Only use in a throwaway folder." },
];

export function normalizeTier(t: unknown): Tier {
  return t === "intermediate" || t === "advanced" ? t : "beginner";
}

export function capsFor(tier: Tier): Caps {
  const mid = tier !== "beginner";
  const adv = tier === "advanced";
  return {
    modelPicker: mid,
    modePicker: mid,
    permissionModes: adv ? ["default", "acceptEdits", "plan", "bypassPermissions"] : ["default", "acceptEdits", "plan"],
    diffs: mid,
    rawLog: adv,
    extraArgs: adv,
    presetEditor: mid,
  };
}

/** Split a user-typed flag string into args, honouring simple double/single quotes. */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
