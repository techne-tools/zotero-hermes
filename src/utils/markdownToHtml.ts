/**
 * Lightweight Markdown-to-HTML converter for rendering agent responses
 * in the Zotero Firefox sandbox where full markdown libraries may not be available.
 *
 * Supports:
 *   - Headers (# ## ###)
 *   - Bold (**text**)
 *   - Italic (*text* or _text_)
 *   - Strikethrough (~~text~~)
 *   - Unordered lists (- item)
 *   - Ordered lists (1. item)
 *   - Inline code (`code`)
 *   - Code blocks (```lang\ncode```)
 *   - Blockquotes (> text)
 *   - Horizontal rules (---)
 *   - Links [text](url)
 *   - Line breaks
 *
 * SECURITY: Output is intended for React's dangerouslySetInnerHTML. All HTML
 * tags in the source are stripped to prevent XSS.
 */

const ESCAPE_HTML = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPE_HTML.get(ch) || ch);
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^\u003e]*>/g, "");
}

export function markdownToHtml(markdown: string): string {
  let text = stripHtmlTags(markdown);

  // Escape HTML entities
  text = escapeHtml(text);

  // Code blocks (must be before inline code)
  text = text.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_match, _lang, code) =>
      `\u003cpre style="background:#f4f4f4;padding:8px;border-radius:4px;overflow-x:auto;"\u003e\u003ccode\u003e${code.trim()}\u003c/code\u003e\u003c/pre\u003e`,
  );

  // Inline code
  text = text.replace(
    /`([^`]+)`/g,
    (_match, code) =>
      `\u003ccode style="background:#f4f4f4;padding:2px 4px;border-radius:3px;font-family:monospace;"\u003e${code}\u003c/code\u003e`,
  );

  // Headers
  text = text.replace(
    /^###### (.*$)/gim,
    (_match, content) =>
      `\u003ch6 style="margin:8px 0;font-size:0.85em;opacity:0.7;"\u003e${content.trim()}\u003c/h6\u003e`,
  );
  text = text.replace(
    /^##### (.*$)/gim,
    (_match, content) =>
      `\u003ch5 style="margin:8px 0;font-size:0.9em;opacity:0.75;"\u003e${content.trim()}\u003c/h5\u003e`,
  );
  text = text.replace(
    /^#### (.*$)/gim,
    (_match, content) =>
      `\u003ch4 style="margin:10px 0;font-size:1em;opacity:0.8;"\u003e${content.trim()}\u003c/h4\u003e`,
  );
  text = text.replace(
    /^### (.*$)/gim,
    (_match, content) =>
      `\u003ch3 style="margin:12px 0;font-size:1.1em;font-weight:600;"\u003e${content.trim()}\u003c/h3\u003e`,
  );
  text = text.replace(
    /^## (.*$)/gim,
    (_match, content) =>
      `\u003ch2 style="margin:14px 0;font-size:1.2em;font-weight:600;border-bottom:1px solid var(--hermes-border,#e0e0e0);padding-bottom:4px;"\u003e${content.trim()}\u003c/h2\u003e`,
  );
  text = text.replace(
    /^# (.*$)/gim,
    (_match, content) =>
      `\u003ch1 style="margin:16px 0;font-size:1.4em;font-weight:700;"\u003e${content.trim()}\u003c/h1\u003e`,
  );

  // Bold
  text = text.replace(
    /\*\*([^*]+)\*\*/g,
    (_match, content) => `\u003cstrong\u003e${content}\u003c/strong\u003e`,
  );
  text = text.replace(
    /__([^_]+)__/g,
    (_match, content) => `\u003cstrong\u003e${content}\u003c/strong\u003e`,
  );

  // Italic (but not already processed bold)
  text = text.replace(
    /\*([^*]+)\*/g,
    (_match, content) => `\u003cem\u003e${content}\u003c/em\u003e`,
  );
  text = text.replace(
    /_([^_]+)_/g,
    (_match, content) => `\u003cem\u003e${content}\u003c/em\u003e`,
  );

  // Strikethrough
  text = text.replace(
    /~~([^~]+)~~/g,
    (_match, content) => `\u003cdel\u003e${content}\u003c/del\u003e`,
  );

  // Links
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label, url) =>
      `\u003ca href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--hermes-accent,#4a90d9);text-decoration:underline;"\u003e${label}\u003c/a\u003e`,
  );

  // Blockquotes
  text = text.replace(
    /^\u003e (.*$)/gim,
    (_match, content) =>
      `\u003cblockquote style="border-left:3px solid var(--hermes-accent,#4a90d9);padding-left:12px;margin:8px 0;opacity:0.85;"\u003e${content.trim()}\u003c/blockquote\u003e`,
  );

  // Horizontal rules
  text = text.replace(
    /^---$/gim,
    () =>
      `\u003chr style="border:none;border-top:1px solid var(--hermes-border,#e0e0e0);margin:12px 0;" /\u003e`,
  );

  // Unordered lists
  text = text.replace(/^(\s*)- (.*$)/gim, (_match, indent, content) => {
    const depth =
      indent.length > 0 ? ` style="margin-left:${indent.length * 12}px;"` : "";
    return `\u003cli${depth}\u003e${content.trim()}\u003c/li\u003e`;
  });
  // Wrap consecutive li elements in ul
  text = text.replace(
    /(\u003cli[^\u003e]*\u003e.*\u003c\/li\u003e\n?)+/g,
    (match) =>
      `\u003cul style="margin:4px 0;padding-left:20px;"\u003e${match}\u003c/ul\u003e`,
  );

  // Ordered lists
  text = text.replace(/^(\s*)\d+\. (.*$)/gim, (_match, indent, content) => {
    const depth =
      indent.length > 0 ? ` style="margin-left:${indent.length * 12}px;"` : "";
    return `\u003cli${depth}\u003e${content.trim()}\u003c/li\u003e`;
  });
  // Wrap consecutive numbered li elements in ol
  text = text.replace(
    /(\u003cli[^\u003e]*\u003e.*\u003c\/li\u003e\n?)+/g,
    (match) => {
      if (match.includes("\u003cul")) return match; // already processed
      return `\u003col style="margin:4px 0;padding-left:20px;"\u003e${match}\u003c/ol\u003e`;
    },
  );

  // Line breaks (preserve paragraphs)
  text = text.replace(/\n\n/g, "\u003c/div\u003e\u003c/div\u003e");
  text = text.replace(/\n/g, "\u003cbr /\u003e");

  // Wrap in paragraph divs if not already wrapped
  if (!text.startsWith("\u003c")) {
    text = `\u003cdiv\u003e${text}\u003c/div\u003e`;
  }

  return text;
}
