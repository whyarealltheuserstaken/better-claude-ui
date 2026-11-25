/** Projects: a name, standing instructions, and an optional folder. Every conversation started
 *  from a project gets the instructions appended to its system prompt. */

export interface Project {
  id: string;
  name: string;
  instructions: string;
  /** Folder for Code sessions; Chat ignores it. */
  cwd: string | null;
}

export const MAX_NAME = 60;
export const MAX_INSTRUCTIONS = 20_000;

export function sanitizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_NAME) : "";
  if (!name) return null;
  const id = typeof r.id === "string" && /^[a-z0-9-_]{1,48}$/.test(r.id) ? r.id : "";
  if (!id) return null;
  return {
    id,
    name,
    instructions: typeof r.instructions === "string" ? r.instructions.slice(0, MAX_INSTRUCTIONS) : "",
    cwd: typeof r.cwd === "string" && r.cwd.trim() ? r.cwd.trim() : null,
  };
}

/** Valid projects only, without duplicate ids. */
export function allProjects(raw: unknown[]): Project[] {
  const out: Project[] = [];
  for (const r of raw) {
    const p = sanitizeProject(r);
    if (p && !out.some((x) => x.id === p.id)) out.push(p);
  }
  return out;
}

export function newProjectId(name: string, existing: string[]): string {
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "project";
  let id = stem;
  for (let n = 2; existing.includes(id); n++) id = `${stem}-${n}`;
  return id;
}

export function findProject(raw: unknown[], id: string | null | undefined): Project | null {
  return id ? (allProjects(raw).find((p) => p.id === id) ?? null) : null;
}

/** Characters left before the instructions limit. */
export function remaining(text: string): number {
  return MAX_INSTRUCTIONS - text.length;
}
