import { config } from "../../../package.json";
import type { Conversation } from "./ConversationManager";
import type { ChatMessage as UIMessage } from "../../views/HermesChatView";

/**
 * Manages chat conversations and state for Hermes Agent.
 * Integrates with ConversationManager for persistence.
 */
export class ChatManager {
  private messages: UIMessage[] = [];
  private readonly addon: any;

  constructor(addon: any) {
    this.addon = addon;
  }

  public addMessage(message: UIMessage): void {
    this.messages.push(message);
    
    // Sync to current conversation
    const conv = this.addon.data.hermes?.conversations.getCurrentConversation();
    if (conv) {
      conv.messages = [...this.messages];
      this.addon.data.hermes?.conversations.saveConversation(conv);
    }
  }

  public getMessages(): UIMessage[] {
    return [...this.messages];
  }

  public setMessages(newMessages: UIMessage[]): void {
    this.messages = newMessages;
    
    // Sync to current conversation
    const conv = this.addon.data.hermes?.conversations.getCurrentConversation();
    if (conv) {
      conv.messages = newMessages;
      this.addon.data.hermes?.conversations.saveConversation(conv);
    }
  }

  public clearMessages(): void {
    this.messages = [];
    this.addon.data.hermes?.conversations.clearMessages();
  }

  public loadFromConversation(conv: Conversation): void {
    this.messages = conv.messages || [];
  }
}
