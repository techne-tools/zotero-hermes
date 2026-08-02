/**
 * Hermes binary discovery for ACP mode.
 *
 * Searches $PATH and common install locations for the `hermes` executable.
 * Cached nsIEnvironment service to avoid repeated component instantiation.
 *
 * NOTE: Callers are responsible for resolving the configured binary path from
 * preferences (via PreferencesManager.getHermesPath()) and passing it here.
 * This module does NOT read Zotero.Prefs directly — that responsibility belongs
 * to PreferencesManager, keeping pref access in one place.
 */

const HERMES_BINARY_CANDIDATES = ["hermes", "hermes-cli"];

const HERMES_PATH_CANDIDATES = [
  "/usr/local/bin",
  "/usr/bin",
  "/opt/homebrew/bin",
  "/opt/local/bin",
  "~/.local/bin",
  "~/bin",
];

/** Cached nsIEnvironment service */
function getEnv(): any {
  return (Components.classes as any)[
    "@mozilla.org/process/environment;1"
  ].getService((Components.interfaces as any).nsIEnvironment);
}

function fileExists(path: string): boolean {
  try {
    const file = (Components.classes as any)[
      "@mozilla.org/file/local;1"
    ].createInstance((Components.interfaces as any).nsIFile);
    file.initWithPath(path);
    return file.exists() && file.isExecutable();
  } catch {
    return false;
  }
}

/**
 * Resolve the Hermes binary path.
 *
 * @param configuredPath - The path from preferences (may be empty string).
 *   Callers should obtain this via `PreferencesManager.getHermesPath()`.
 * @returns The resolved binary path, or null if not found.
 */
export function resolveHermesPath(configuredPath: string): string | null {
  if (configuredPath) return configuredPath;
  return findHermesPath();
}

/**
 * Auto-discover the Hermes binary across $PATH and common install locations.
 */
export function findHermesPath(): string | null {
  const env = getEnv();

  // 1. Try $PATH
  const pathEnv = env.get("PATH") || "";
  for (const dir of pathEnv.split(":")) {
    for (const bin of HERMES_BINARY_CANDIDATES) {
      const candidate = `${dir}/${bin}`;
      if (fileExists(candidate)) return candidate;
    }
  }

  // 2. Try common install locations
  const homeDir = env.get("HOME") || "";
  for (const dir of HERMES_PATH_CANDIDATES) {
    const resolvedDir = dir.startsWith("~") ? `${homeDir}${dir.slice(1)}` : dir;
    for (const bin of HERMES_BINARY_CANDIDATES) {
      const candidate = `${resolvedDir}/${bin}`;
      if (fileExists(candidate)) return candidate;
    }
  }

  return null;
}

/**
 * Check if a Hermes binary is available (configured or discoverable).
 *
 * @param configuredPath - The path from preferences (may be empty string).
 *   Callers should obtain this via `PreferencesManager.getHermesPath()`.
 */
export function isHermesAvailable(configuredPath: string): boolean {
  return Boolean(configuredPath || findHermesPath());
}

/**
 * Get the home directory from the environment.
 */
export function getHomeDir(): string {
  return getEnv().get("HOME") || "";
}
