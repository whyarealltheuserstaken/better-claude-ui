/** Slash-command autocomplete for the composer. */

/** Is the user currently typing a command name (a leading "/" and no space yet)? */
export function slashQuery(text: string): string | null {
  const m = /^\/([^\s]*)$/.exec(text);
  return m ? m[1].toLowerCase() : null;
}

/** Best matches first: prefix matches (also on the part after "plugin:"), then substring matches. */
export function slashMatches(query: string, commands: string[], max = 8): string[] {
  const q = query.toLowerCase();
  const short = (c: string) => c.slice(c.indexOf(":") + 1).toLowerCase();
  const prefix: string[] = [];
  const contains: string[] = [];
  const seen = new Set<string>();
  for (const c of commands) {
    if (seen.has(c)) continue;
    seen.add(c);
    const lc = c.toLowerCase();
    if (lc.startsWith(q) || short(c).startsWith(q)) prefix.push(c);
    else if (lc.includes(q)) contains.push(c);
  }
  const byLen = (a: string, b: string) => a.length - b.length || a.localeCompare(b);
  return [...prefix.sort(byLen), ...contains.sort(byLen)].slice(0, max);
}

/** The text to put in the composer when a command is chosen. */
export function completeCommand(command: string): string {
  return `/${command} `;
}
