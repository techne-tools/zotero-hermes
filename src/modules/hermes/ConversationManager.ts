import type Addon from "../../addon";
import type { ChatMessage } from "../../views/HermesChatView";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  allowedTools: string[] | null;
}

/**
 * Manages conversation persistence and history for Hermes Agent.
 * Conversations are stored in Zotero's data directory as JSON files.
 */
export class ConversationManager {
  private readonly addon: Addon;
  private currentConversation: Conversation | null = null;
  private conversations = new Map<string, Conversation>();

  // Cached resolved directory path. Invalidated when org/folder prefs change.
  private _cachedDir: string | null = null;
  private _cachedDirOrg: string | null = null;
  private _cachedDirFolder: string | null = null;

  constructor(addon: Addon) {
    this.addon = addon;
  }

  /**
   * Get the base conversations directory path.
   */
  private getBaseDir(): string {
    const profileDir = Zotero.getProfileDirectory?.();
    if (!profileDir) {
      return "/tmp/zotero-hermes-conversations";
    }
    const baseDir = profileDir.clone() as nsIFile;
    const folderName =
      this.addon.data.hermes?.preferences?.get("chatSaveFolder", "hermes") ||
      "hermes";
    baseDir.append("zotero-hermes");
    baseDir.append(folderName);
    if (!baseDir.exists()) {
      baseDir.create(
        Components.interfaces.nsIFile.DIRECTORY_TYPE as number,
        0o755,
      );
    }
    return baseDir.path;
  }

  /**
   * Get the conversations directory path, respecting organisation preference.
   * Result is cached and only recomputed when the org or folder prefs change.
   */
  private getConversationsDir(): string {
    const organization =
      this.addon.data.hermes?.preferences?.get<string>(
        "conversationOrganization",
        "flat",
      ) || "flat";
    const folderName =
      this.addon.data.hermes?.preferences?.get("chatSaveFolder", "hermes") ||
      "hermes";

    // Invalidate cache if relevant prefs have changed since last call.
    if (
      this._cachedDir !== null &&
      this._cachedDirOrg === organization &&
      this._cachedDirFolder === folderName
    ) {
      return this._cachedDir;
    }

    const baseDir = this.getBaseDir();
    let resolvedDir: string;

    if (organization === "by-date") {
      const now = new Date();
      const monthDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const dir = Zotero.File.pathToFile(baseDir);
      const subDir = dir.clone() as nsIFile;
      subDir.append(monthDir);
      if (!subDir.exists()) {
        subDir.create(
          Components.interfaces.nsIFile.DIRECTORY_TYPE as number,
          0o755,
        );
      }
      resolvedDir = subDir.path;
    } else {
      // flat (default) or by-project (not yet implemented)
      resolvedDir = baseDir;
    }

    this._cachedDir = resolvedDir;
    this._cachedDirOrg = organization;
    this._cachedDirFolder = folderName;

    return resolvedDir;
  }

  /**
   * Get the file path for a conversation.
   */
  private getConversationFile(id: string): string {
    return `${this.getConversationsDir()}/${id}.json`;
  }

  /**
   * Create a new conversation.
   */
  public createConversation(title?: string): Conversation {
    const conversation: Conversation = {
      id: this.generateId(),
      title: title || `Conversation ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      allowedTools: null,
    };
    this.currentConversation = conversation;
    this.conversations.set(conversation.id, conversation);
    this.saveConversation(conversation);
    return conversation;
  }

  /**
   * Save a conversation to disk.
   */
  public saveConversation(conversation: Conversation): void {
    conversation.updatedAt = Date.now();
    this.conversations.set(conversation.id, conversation);

    const filePath = this.getConversationFile(conversation.id);
    const json = JSON.stringify(conversation, null, 2);

    try {
      const file = Zotero.File.pathToFile(filePath);
      Zotero.File.putContents(file, json);
    } catch (err) {
      this.addon.log(`Failed to save conversation: ${(err as Error).message}`);
    }
  }

  /**
   * Load a conversation from disk.
   */
  public loadConversation(id: string): Conversation | null {
    const filePath = this.getConversationFile(id);

    try {
      const file = Zotero.File.pathToFile(filePath);
      if (!file.exists()) {
        return null;
      }

      const json = Zotero.File.getContents(file) as string;
      const conversation = JSON.parse(json) as Conversation;

      this.conversations.set(id, conversation);
      this.currentConversation = conversation;
      return conversation;
    } catch (err) {
      this.addon.log(`Failed to load conversation: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Load all conversations from disk.
   */
  public loadAllConversations(): Conversation[] {
    const dir = this.getConversationsDir();
    const dirFile = Zotero.File.pathToFile(dir);

    if (!dirFile.exists() || !dirFile.isDirectory()) {
      return [];
    }

    const entries = dirFile.directoryEntries;
    const conversations: Conversation[] = [];

    while (entries.hasMoreElements()) {
      const entry = entries.getNext() as nsIFile;
      if (entry.leafName.endsWith(".json")) {
        const conv = this.loadConversation(entry.leafName.replace(".json", ""));
        if (conv) {
          conversations.push(conv);
        }
      }
    }

    return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Delete a conversation.
   */
  public deleteConversation(id: string): boolean {
    const filePath = this.getConversationFile(id);

    try {
      const file = Zotero.File.pathToFile(filePath);
      if (file.exists()) {
        file.remove(false);
      }
      this.conversations.delete(id);
      if (this.currentConversation?.id === id) {
        this.currentConversation = null;
      }
      return true;
    } catch (err) {
      this.addon.log(
        `Failed to delete conversation: ${(err as Error).message}`,
      );
      return false;
    }
  }

  public getCurrentConversation(): Conversation | null {
    return this.currentConversation;
  }

  public setCurrentConversation(id: string): void {
    const conversation =
      this.conversations.get(id) || this.loadConversation(id);
    if (conversation) {
      this.currentConversation = conversation;
    }
  }

  public getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  public clearMessages(): void {
    if (this.currentConversation) {
      this.currentConversation.messages = [];
      this.saveConversation(this.currentConversation);
    }
  }

  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
