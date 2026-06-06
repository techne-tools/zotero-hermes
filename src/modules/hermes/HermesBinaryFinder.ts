/**
 * Hermes binary discovery for ACP mode.
 *
 * Searches $PATH and common install locations for the `hermes` executable.
 * Cached nsIEnvironment service to avoid repeated component instantiation.
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
  return (Components.classes as any)["@mozilla.org/process/environment;1"]
    .getService((Components.interfaces as any).nsIEnvironment);
}

function fileExists(path: string): boolean {
  try {
    const file = (Components.classes as any)["@mozilla.org/file/local;1"]
      .createInstance((Components.interfaces as any).nsIFile);
    file.initWithPath(path);
    return file.exists() && file.isExecutable();
  } catch {
    return false;
  }
}

/**
 * Resolve the Hermes binary path.
 * Prefers configured path from preferences, falls back to auto-discovery.
 */
export function resolveHermesPath(prefsPrefix: string): string | null {
  const configuredPath = Zotero.Prefs.get(`${prefsPrefix}.binaryPath`, true) as string;
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
 */
export function isHermesAvailable(prefsPrefix: string): boolean {
  const configuredPath = Zotero.Prefs.get(`${prefsPrefix}.binaryPath`, true) as string;
  return Boolean(configuredPath || findHermesPath());
}

/**
 * Get the home directory from the environment.
 */
export function getHomeDir(): string {
  return getEnv().get("HOME") || "~/";
}