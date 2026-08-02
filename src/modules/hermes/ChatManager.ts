import type Addon from "../../addon";
import type { Conversation } from "./ConversationManager";
import { ChatMessage } from "../../views/types";

/**
 * Manages chat conversations and state for Hermes Agent.
 * Integrates with ConversationManager for persistence.
 *
 * Saves are debounced (500ms) to avoid excessive I/O during streaming.
 */
export class ChatManager {
  private messages: ChatMessage[] = [];
  private readonly addon: Addon;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SAVE_DEBOUNCE_MS = 500;

  constructor(addon: Addon) {
    this.addon = addon;
  }

  /**
   * Schedule a debounced save to disk. Only the last call within the
   * debounce window actually writes.
   */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const conv =
        this.addon.data.hermes?.conversations.getCurrentConversation();
      if (conv) {
        conv.messages = [...this.messages];
        this.addon.data.hermes?.conversations.saveConversation(conv);
      }
    }, this.SAVE_DEBOUNCE_MS);
  }

  public addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.scheduleSave();
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public setMessages(newMessages: ChatMessage[]): void {
    this.messages = newMessages;
    this.scheduleSave();
  }

  public clearMessages(): void {
    this.messages = [];
    // Flush immediately on clear
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.addon.data.hermes?.conversations.clearMessages();
  }

  public loadFromConversation(conv: Conversation): void {
    this.messages = conv.messages || [];
  }

  /**
   * Force an immediate flush of any pending save.
   */
  public flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const conv = this.addon.data.hermes?.conversations.getCurrentConversation();
    if (conv) {
      conv.messages = [...this.messages];
      this.addon.data.hermes?.conversations.saveConversation(conv);
    }
  }
}
