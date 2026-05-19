/**
 * Manages conversation persistence and history for Hermes Agent.
 */
export class ConversationManager {
  private readonly plugin: any;
  private currentConversation: Conversation | null = null;
  private conversations: Map<string, Conversation> = new Map();

  constructor(plugin: any) {
    this.plugin = plugin;
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
      contextItems: [],
    };

    this.currentConversation = conversation;
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  /**
   * Get the current conversation.
   */
  public getCurrentConversation(): Conversation | null {
    return this.currentConversation;
  }

  /**
   * Set the current conversation.
   */
  public setCurrentConversation(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      this.currentConversation = conversation;
    }
  }

  /**
   * Add a message to the current conversation.
   */
  public addMessage(
    role: "user" | "assistant" | "system",
    content: string,
  ): void {
    if (!this.currentConversation) {
      this.createConversation();
    }

    const message: Message = {
      id: this.generateId(),
      role,
      content,
      timestamp: Date.now(),
    };

    this.currentConversation!.messages.push(message);
    this.currentConversation!.updatedAt = Date.now();
  }

  /**
   * Undo the last user turn in the current conversation.
   */
  public undoLastTurn(): void {
    if (!this.currentConversation) return;
    const msgs = this.currentConversation.messages;
    let lastUserIndex = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex !== -1) {
      this.currentConversation.messages = msgs.slice(0, lastUserIndex);
      this.currentConversation.updatedAt = Date.now();
    }
  }

  /**
   * Track a tool call for the current assistant message.
   */
  public addOrUpdateToolCall(
    toolCallId: string,
    title: string,
    status: string,
    payload?: string,
  ): void {
    if (
      !this.currentConversation ||
      this.currentConversation.messages.length === 0
    )
      return;
    const lastMessage =
      this.currentConversation.messages[
        this.currentConversation.messages.length - 1
      ];
    if (lastMessage && lastMessage.role === "assistant") {
      lastMessage.toolCalls = lastMessage.toolCalls || [];
      const existing = lastMessage.toolCalls.find((t) => t.id === toolCallId);
      if (existing) {
        existing.status = status;
        if (payload) existing.payload = payload;
      } else {
        lastMessage.toolCalls.push({ id: toolCallId, title, status, payload });
      }
      this.currentConversation.updatedAt = Date.now();
    }
  }

  /**
   * Add context items to the current conversation.
   */
  public addContextItems(items: ContextItem[]): void {
    if (!this.currentConversation) {
      this.createConversation();
    }

    this.currentConversation!.contextItems.push(...items);
    this.currentConversation!.updatedAt = Date.now();
  }

  /**
   * Clear context items from the current conversation.
   */
  public clearContextItems(): void {
    if (this.currentConversation) {
      this.currentConversation.contextItems = [];
    }
  }

  /**
   * Get all conversations.
   */
  public getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  /**
   * Get a specific conversation.
   */
  public getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  /**
   * Delete a conversation.
   */
  public deleteConversation(id: string): boolean {
    const deleted = this.conversations.delete(id);
    if (deleted && this.currentConversation?.id === id) {
      this.currentConversation = null;
    }
    return deleted;
  }

  /**
   * Rename a conversation.
   */
  public renameConversation(id: string, newTitle: string): boolean {
    const conversation = this.conversations.get(id);
    if (conversation) {
      conversation.title = newTitle;
      conversation.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Export conversation to a Zotero note.
   */
  public async exportToNote(conversationId?: string): Promise<number | null> {
    const conversation = conversationId
      ? this.conversations.get(conversationId)
      : this.currentConversation;

    if (!conversation) return null;

    const content = this.formatConversationForExport(conversation);

    try {
      const note = new Zotero.Item("note");
      note.libraryID = Zotero.Libraries.userLibraryID;
      note.setNote(content);
      await note.saveTx();
      return note.id;
    } catch (error) {
      this.plugin.log("Error exporting conversation to note", error);
      return null;
    }
  }

  /**
   * Format conversation for export.
   */
  private formatConversationForExport(conversation: Conversation): string {
    const lines: string[] = [
      `<h1>${this.escapeHtml(conversation.title)}</h1>`,
      `<p><em>Created: ${new Date(conversation.createdAt).toLocaleString()}</em></p>`,
      "<hr>",
    ];

    for (const message of conversation.messages) {
      const roleLabel = message.role === "user" ? "You" : "Hermes";
      lines.push(`<h2>${roleLabel}</h2>`);
      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const tool of message.toolCalls) {
          const statusIcon =
            tool.status === "complete"
              ? "✅"
              : tool.status === "error"
                ? "❌"
                : "⏳";
          let payloadData = "";
          if (tool.payload) {
            payloadData = ` data-payload="${this.escapeHtml(btoa(encodeURIComponent(tool.payload)))}"`;
          }
          lines.push(
            `<p><em${payloadData}>${statusIcon} Tool: ${this.escapeHtml(tool.title)} (${this.escapeHtml(tool.status)})</em></p>`,
          );
        }
      }
      lines.push(`<p>${this.escapeHtml(message.content)}</p>`);
    }

    return lines.join("\n");
  }

  /**
   * Auto-save current conversation to a note.
   */
  public async autoSave(): Promise<void> {
    if (
      !this.currentConversation ||
      this.currentConversation.messages.length === 0
    ) {
      return;
    }

    try {
      const content = this.formatConversationForExport(
        this.currentConversation,
      );

      // Check if we already have an auto-save note for this conversation
      const search = new Zotero.Search();
      search.addCondition("itemType", "is", "note");
      search.addCondition(
        "note",
        "contains",
        `Hermes Conversation: ${this.currentConversation.title}`,
      );
      const results = await search.search();

      if (results.length > 0) {
        // Update existing note
        const note = await Zotero.Items.getAsync(results[0]);
        note.setNote(content);
        await note.saveTx();
      } else {
        // Create new auto-save note
        const note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote(content);
        await note.saveTx();
      }
    } catch (error) {
      this.plugin.log("Error auto-saving conversation", error);
    }
  }

  /**
   * Load conversation history from storage.
   */
  public loadFromStorage(): void {
    try {
      const stored = Zotero.Prefs.get("hermes.conversations") as string;
      if (stored) {
        const data = JSON.parse(stored);
        for (const conv of data) {
          this.conversations.set(conv.id, conv);
        }
      }
    } catch (error) {
      this.plugin.log("Error loading conversations from storage", error);
    }
  }

  /**
   * Save conversation history to storage.
   */
  public saveToStorage(): void {
    try {
      const data = Array.from(this.conversations.values());
      Zotero.Prefs.set("hermes.conversations", JSON.stringify(data));
    } catch (error) {
      this.plugin.log("Error saving conversations to storage", error);
    }
  }

  /**
   * Generate a unique ID.
   */
  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Escape HTML for safe rendering.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    id: string;
    title: string;
    status: string;
    payload?: string;
  }>;
}

export interface ContextItem {
  type: string;
  id: number;
  title: string;
  content?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  contextItems: ContextItem[];
}
