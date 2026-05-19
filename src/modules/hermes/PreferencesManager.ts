/**
 * Manages Hermes preferences and settings.
 */
export class PreferencesManager {
  private readonly plugin: any;
  private readonly defaults: Record<string, any> = {
    "extensions.hermes.binaryPath": "",
    "extensions.hermes.connectionMode": "stdio",
    "extensions.hermes.autoSave": true,
    "extensions.hermes.showReasoning": true,
    "extensions.hermes.typingEffects": true,
    "extensions.hermes.enableCitations": true,
    "extensions.hermes.enableAnnotations": true,
    "extensions.hermes.enableTags": true,
  };

  constructor(plugin: any) {
    this.plugin = plugin;
    this.initializeDefaults();
  }

  /**
   * Initialize default preferences if not set.
   */
  private initializeDefaults(): void {
    for (const [key, value] of Object.entries(this.defaults)) {
      if (Zotero.Prefs.get(key) === undefined) {
        Zotero.Prefs.set(key, value);
      }
    }
  }

  /**
   * Get a preference value.
   */
  public get<T>(key: string, defaultValue?: T): T {
    const fullKey = key.startsWith("extensions.hermes.")
      ? key
      : `extensions.hermes.${key}`;
    const value = Zotero.Prefs.get(fullKey);
    return value !== undefined ? (value as T) : (defaultValue as T);
  }

  /**
   * Set a preference value.
   */
  public set<T extends string | number | boolean>(key: string, value: T): void {
    const fullKey = key.startsWith("extensions.hermes.")
      ? key
      : `extensions.hermes.${key}`;
    Zotero.Prefs.set(fullKey, value);
  }

  /**
   * Get binary path.
   */
  public getBinaryPath(): string {
    return this.get<string>("binaryPath", "");
  }

  /**
   * Set binary path.
   */
  public setBinaryPath(path: string): void {
    this.set("binaryPath", path);
  }

  /**
   * Get connection mode.
   */
  public getConnectionMode(): "stdio" | "http" {
    return this.get<"stdio" | "http">("connectionMode", "stdio");
  }

  /**
   * Set connection mode.
   */
  public setConnectionMode(mode: "stdio" | "http"): void {
    this.set("connectionMode", mode);
  }

  /**
   * Check if auto-save is enabled.
   */
  public isAutoSaveEnabled(): boolean {
    return this.get<boolean>("autoSave", true);
  }

  /**
   * Check if reasoning should be shown.
   */
  public shouldShowReasoning(): boolean {
    return this.get<boolean>("showReasoning", true);
  }

  /**
   * Check if typing effects are enabled.
   */
  public areTypingEffectsEnabled(): boolean {
    return this.get<boolean>("typingEffects", true);
  }

  /**
   * Check if citations are enabled.
   */
  public areCitationsEnabled(): boolean {
    return this.get<boolean>("enableCitations", true);
  }

  /**
   * Check if annotations are enabled.
   */
  public areAnnotationsEnabled(): boolean {
    return this.get<boolean>("enableAnnotations", true);
  }

  /**
   * Check if tags are enabled.
   */
  public areTagsEnabled(): boolean {
    return this.get<boolean>("enableTags", true);
  }

  /**
   * Reset all preferences to defaults.
   */
  public resetToDefaults(): void {
    for (const [key, value] of Object.entries(this.defaults)) {
      Zotero.Prefs.set(key, value);
    }
  }

  /**
   * Open preferences dialog.
   */
  public openPreferences(): void {
    // Open the preferences window
    const window = Zotero.getMainWindow();
    if (window) {
      window.openDialog(
        "chrome://hermes/content/preferences.xhtml",
        "hermes-preferences",
        "chrome,titlebar,toolbar,centerscreen,resizable",
      );
    }
  }
}
