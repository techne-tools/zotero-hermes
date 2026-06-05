/**
 * Manages Hermes preferences and settings.
 */
export class PreferencesManager {
  private readonly addon: any;
  private readonly defaults: Record<string, any> = {
    "extensions.zotero.hermes.binaryPath": "",
    "extensions.zotero.hermes.connectionMode": "stdio",
    "extensions.zotero.hermes.apiUrl": "",
    "extensions.zotero.hermes.apiKey": "",
    "extensions.zotero.hermes.chatAgentName": "Hermes",
    "extensions.zotero.hermes.autoSave": true,
    "extensions.zotero.hermes.showReasoning": true,
    "extensions.zotero.hermes.showToolUse": true,
    "extensions.zotero.hermes.showTokenCount": false,
    "extensions.zotero.hermes.enableDebugMode": false,
    "extensions.zotero.hermes.enableCitations": true,
    "extensions.zotero.hermes.enableAnnotations": true,
    "extensions.zotero.hermes.enableTags": true,
  };

  constructor(addon: any) {
    this.addon = addon;
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    for (const [key, value] of Object.entries(this.defaults)) {
      if (Zotero.Prefs.get(key) === undefined) {
        Zotero.Prefs.set(key, value);
      }
    }
  }

  public get<T>(key: string, defaultValue?: T): T {
    const fullKey = key.startsWith("extensions.zotero.hermes.")
      ? key
      : `extensions.zotero.hermes.${key}`;
    const value = Zotero.Prefs.get(fullKey);
    return value !== undefined ? (value as T) : (defaultValue as T);
  }

  public set<T extends string | number | boolean>(key: string, value: T): void {
    const fullKey = key.startsWith("extensions.zotero.hermes.")
      ? key
      : `extensions.zotero.hermes.${key}`;
    Zotero.Prefs.set(fullKey, value);
  }

  public getHermesPath(): string {
    return this.get<string>("binaryPath", "");
  }

  public setHermesPath(path: string): void {
    this.set("binaryPath", path);
  }

  public getConnectionMode(): string {
    return this.get<string>("connectionMode", "stdio");
  }

  public setConnectionMode(mode: string): void {
    this.set("connectionMode", mode);
  }
}
