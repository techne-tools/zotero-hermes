import { config } from "../../../package.json";

/**
 * Manages chat conversations and state for Hermes Agent.
 */
export class ChatManager {
  private messages: ChatMessage[] = [];
  private readonly plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  /**
   * Add a user message to the conversation.
   */
  public addUserMessage(content: string): void {
    const message: ChatMessage = {
      id: this.generateId(),
      content,
      role: "user",
      timestamp: Date.now(),
    };
    this.messages.push(message);
  }

  /**
   * Add an assistant message to the conversation.
   * If the last message is from the assistant, update it instead (for streaming).
   */
  public addAssistantMessage(content: string): void {
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant") {
      // Update existing assistant message (streaming update)
      lastMessage.content = content;
      lastMessage.timestamp = Date.now();
    } else {
      // Add new assistant message
      const message: ChatMessage = {
        id: this.generateId(),
        content,
        role: "assistant",
        timestamp: Date.now(),
      };
      this.messages.push(message);
    }
  }

  /**
   * Update the last assistant message with new content.
   * Used for streaming responses.
   */
  public updateLastAssistantMessage(content: string): void {
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant") {
      lastMessage.content = content;
    } else {
      this.addAssistantMessage(content);
    }
  }

  /**
   * Track a tool call for the last assistant message.
   */
  public addOrUpdateToolCall(
    toolCallId: string,
    title: string,
    status: string,
    payload?: string,
  ): void {
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant") {
      lastMessage.toolCalls = lastMessage.toolCalls || [];
      const existing = lastMessage.toolCalls.find((t) => t.id === toolCallId);
      if (existing) {
        existing.status = status;
        if (payload) existing.payload = payload;
      } else {
        lastMessage.toolCalls.push({ id: toolCallId, title, status, payload });
      }
    }
  }

  /**
   * Get all messages in the conversation.
   */
  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Undo the last user turn.
   * Returns the removed user message content, if any.
   */
  public undoLastTurn(): string | null {
    let lastUserIndex = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return null;
    const removedUserMsg = this.messages[lastUserIndex].content;
    this.messages = this.messages.slice(0, lastUserIndex);
    return removedUserMsg;
  }

  /**
   * Clear the conversation.
   */
  public clear(): void {
    this.messages = [];
  }

  /**
   * Save conversation to Zotero note.
   */
  public async saveToNote(title?: string): Promise<void> {
    if (this.messages.length === 0) {
      return;
    }

    const noteTitle = title || `Hermes Chat ${new Date().toLocaleDateString()}`;
    const note = new Zotero.Item("note");
    note.libraryID = Zotero.Libraries.userLibraryID;

    const content = this.messagesToMarkdown();
    note.setNote(content);

    // Fetch attached context items from ItemManager and relate them to the note
    const itemManager = this.plugin.data?.hermes?.items;
    if (itemManager) {
      const attachedItems = itemManager.getAttachedItems();
      for (const item of attachedItems) {
        const relatedItem = await Zotero.Items.getAsync(item.id);
        if (relatedItem) note.addRelatedItem(relatedItem);
      }
    }

    await note.saveTx();

    const pw = new Zotero.ProgressWindow();
    pw.changeHeadline(`Conversation saved to note: ${noteTitle}`);
    pw.show();
    pw.startCloseTimer(3000);
  }

  /**
   * Load conversation from Zotero note.
   */
  public async loadFromNote(noteID: number): Promise<void> {
    const note = await Zotero.Items.getAsync(noteID);
    if (!note || note.itemType !== "note") {
      throw new Error("Invalid note ID");
    }

    const content = note.getNote();
    this.messages = this.markdownToMessages(content);
  }

  /**
   * Convert messages to markdown format.
   */
  private messagesToMarkdown(): string {
    return this.messages
      .map((msg) => {
        const time = new Date(msg.timestamp).toLocaleString();
        const role = msg.role === "user" ? "**You**" : "**Hermes**";

        let toolsMarkdown = "";
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          toolsMarkdown =
            msg.toolCalls
              .map((t) => {
                const payloadStr = t.payload
                  ? ` <!-- ${btoa(encodeURIComponent(t.payload))} -->`
                  : "";
                return `> Tool: ${t.title} (${t.status}) [${t.id}]${payloadStr}`;
              })
              .join("\n") + "\n\n";
        }

        return `## ${role} — ${time}\n\n${toolsMarkdown}${msg.content}\n`;
      })
      .join("\n---\n\n");
  }

  /**
   * Parse markdown back to messages.
   */
  private markdownToMessages(content: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    const sections = content.split(/\n---\n\n/);

    for (const section of sections) {
      if (!section.trim()) continue;

      const headerMatch = section.match(
        /^## \*\*(.+?)\*\* — (.+?)\n\n([\s\S]*)$/,
      );
      if (headerMatch) {
        const [, roleStr, timeStr, body] = headerMatch;

        const toolCalls: Array<{
          id: string;
          title: string;
          status: string;
          payload?: string;
        }> = [];
        let msgContent = body.trim();

        const toolRegex = /^> Tool: (.+?) \((.+?)\) \[(.+?)\](?: --> (.+?))?/gm;
        let match;
        while ((match = toolRegex.exec(body)) !== null) {
          toolCalls.push({
            title: match[1],
            status: match[2],
            id: match[3],
            payload: match[4] ? decodeURIComponent(atob(match[4])) : undefined,
          });
        }

        msgContent = msgContent
          .replace(/^> Tool: .+? \(.*?\) \[.*?\].*\n?/gm, "")
          .trim();

        messages.push({
          id: this.generateId(),
          content: msgContent.trim(),
          role: roleStr === "You" ? "user" : "assistant",
          timestamp: new Date(timeStr).getTime() || Date.now(),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        });
      }
    }
    return messages;
  }

  /**
   * Generate unique message ID.
   */
  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: number;
  toolCalls?: Array<{
    id: string;
    title: string;
    status: string;
    payload?: string;
  }>;
}
