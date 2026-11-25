/** Building the document shown in the artifact preview frame. The frame is also sandboxed with
 *  no permissions, but the document carries its own CSP as a second layer: no scripts, no
 *  network, only inline styles and data: images. */

export const PREVIEW_LANGS = ["html", "svg"] as const;
export type PreviewLang = (typeof PREVIEW_LANGS)[number];

export function isPreviewable(lang: string): boolean {
  return (PREVIEW_LANGS as readonly string[]).includes(lang.toLowerCase());
}

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'";

const META = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">`;

/** Maximum size we are willing to render. */
export const MAX_PREVIEW_CHARS = 400_000;

export function previewDocument(code: string, lang: string): string {
  const src = code.length > MAX_PREVIEW_CHARS ? code.slice(0, MAX_PREVIEW_CHARS) : code;
  if (lang.toLowerCase() === "svg") {
    return `<!doctype html><html><head>${META}<style>html,body{margin:0;height:100%}body{display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100vh}</style></head><body>${src}</body></html>`;
  }
  // Full documents keep their own <head>; our CSP is injected first so it applies to everything.
  if (/<html[\s>]/i.test(src) || /<head[\s>]/i.test(src)) {
    return /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, (m) => `${m}${META}`) : src.replace(/<html[^>]*>/i, (m) => `${m}<head>${META}</head>`);
  }
  return `<!doctype html><html><head>${META}<style>body{font-family:system-ui,sans-serif;margin:16px;color:#111;background:#fff}</style></head><body>${src}</body></html>`;
}
