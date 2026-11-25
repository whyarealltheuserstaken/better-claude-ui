import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLang from "highlight.js/lib/languages/markdown";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { isPreviewable } from "./preview";

const langs: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  bash, css, diff, go, javascript, json, markdown: markdownLang, powershell, python, rust, typescript, xml, yaml,
};
for (const [name, def] of Object.entries(langs)) hljs.registerLanguage(name, def);
hljs.registerAliases(["sh", "shell", "zsh"], { languageName: "bash" });
hljs.registerAliases(["js", "jsx"], { languageName: "javascript" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["html", "svelte", "vue"], { languageName: "xml" });
hljs.registerAliases(["ps1", "pwsh"], { languageName: "powershell" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["rs"], { languageName: "rust" });
hljs.registerAliases(["yml"], { languageName: "yaml" });

const md: InstanceType<typeof MarkdownIt> = new MarkdownIt({
  html: false, // never render raw HTML from model output
  linkify: true,
  breaks: false,
  highlight(code, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : null;
    const body = language ? hljs.highlight(code, { language, ignoreIllegals: true }).value : md.utils.escapeHtml(code);
    return `<pre class="code"><code class="hljs">${body}</code></pre>`;
  },
});

// Every fenced block gets a small bar: language, Copy, and Preview for HTML/SVG.
// Clicks are handled by delegation in Message.svelte via the data-act attributes.
type FenceRule = NonNullable<typeof md.renderer.rules.fence>;
const baseFence: FenceRule = md.renderer.rules.fence as FenceRule;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const lang = tokens[idx].info.trim().split(/\s+/)[0] ?? "";
  const label = md.utils.escapeHtml(lang || "text");
  const preview = isPreviewable(lang) ? '<button type="button" data-act="preview">Preview</button>' : "";
  return `<div class="codeblock"><div class="codebar"><span class="lang">${label}</span><span class="acts"><button type="button" data-act="copy">Copy</button>${preview}</span></div>${baseFence(tokens, idx, options, env, self)}</div>`;
};

// Links open externally and never navigate the app window.
type LinkRule = NonNullable<typeof md.renderer.rules.link_open>;
const fallbackLink: LinkRule = (tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options);
const defaultLink: LinkRule = md.renderer.rules.link_open ?? fallbackLink;
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return defaultLink(tokens, idx, options, env, self);
};

export function renderMarkdown(src: string): string {
  return md.render(src);
}
