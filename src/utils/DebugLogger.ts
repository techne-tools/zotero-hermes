/**
 * Centralized debug logging utility.
 *
 * Mirrors obsidian-hermes/src/DebugLogger.ts
 *
 * WHY THIS EXISTS:
 * During early development, things break constantly. Raw console.log calls
 * clutter the output and can't be toggled by users. This wrapper:
 * - Respects the `enableDebugMode` preference (off by default)
 * - Prefixes all messages with [Hermes] for easy filtering
 * - Provides log levels (debug, info, warn, error)
 *
 * USAGE:
 *   const debug = new DebugLogger(addon);
 *   debug.info('Connection established');
 *   debug.error('Failed to write file', error);
 */
export class DebugLogger {
  private readonly addon: any;

  private get isEnabled(): boolean {
    try {
      return Zotero.Prefs.get(
        "extensions.zotero.hermes.enableDebugMode",
        true,
      ) as boolean;
    } catch {
      return false;
    }
  }

  constructor(addon: any) {
    this.addon = addon;
  }

  /** Detailed diagnostics — only shown when debug mode is on. */
  public debug(message: string, ...args: unknown[]): void {
    if (this.isEnabled) {
      this.addon.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /** General info — shown when debug mode is on. */
  public info(message: string, ...args: unknown[]): void {
    if (this.isEnabled) {
      this.addon.log(`[INFO] ${message}`, ...args);
    }
  }

  /** Warnings — always shown. */
  public warn(message: string, ...args: unknown[]): void {
    this.addon.log(`[WARN] ${message}`, ...args);
  }

  /** Errors — always shown. */
  public error(message: string, ...args: unknown[]): void {
    this.addon.log(`[ERROR] ${message}`, ...args);
  }

  /** Group related logs. Only outputs if debug mode is on. */
  public group(label: string, fn: () => void): void {
    if (this.isEnabled) {
      fn();
    }
  }
}
