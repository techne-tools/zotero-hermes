/**
 * Strip ANSI escape codes from a string.
 * Handles color codes, cursor movements, clear lines, and other terminal sequences.
 *
 * Mirrors obsidian-hermes/src/Views/HermesChatView.tsx
 */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "") // CSI sequences (colors, cursor, etc.)
    .replace(/\x1b\][0-9;]*[^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC sequences
    .replace(/\x1b[()[\]{}#~%@\^=\/>!]/g, "") // Single-char escape sequences
    .replace(/\x1b\x1b/g, ""); // Double escapes
}