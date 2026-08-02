import React from "react";
import { ChatMessage } from "../types";
import type Addon from "../../addon";
import { ChatMessageItem } from "./ChatMessageItem";

interface MessageListProps {
  messages: ChatMessage[];
  addon: Addon;
  isTyping: boolean;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  agentName: string;
  error: string | null;
  onEditMessage: (idx: number, newText: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  addon,
  isTyping,
  messagesContainerRef,
  messagesEndRef,
  agentName,
  error,
  onEditMessage,
}) => {
  return (
    <div ref={messagesContainerRef} className="hermes-messages">
      {messages.map((msg, idx) => (
        <ChatMessageItem
          key={msg.id}
          message={msg}
          addon={addon}
          onEditMessage={
            msg.role === "user" ? (newText) => onEditMessage(idx, newText) : undefined
          }
        />
      ))}
      {isTyping && (
        <div className="hermes-message hermes-message-assistant hermes-typing-indicator">
          {agentName} is typing...
        </div>
      )}
      {error && <div className="hermes-error-bar">{error}</div>}
      <div ref={messagesEndRef} />
    </div>
  );
};
