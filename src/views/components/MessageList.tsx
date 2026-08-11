import React, { useEffect, useState } from "react";
import { ChatMessage } from "../types";
import type Addon from "../../addon";
import { ChatMessageItem } from "./ChatMessageItem";

interface MessageListProps {
  messages: ChatMessage[];
  addon: Addon;
  isTyping: boolean;
  agentName: string;
  error: string | null;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onEditMessage: (idx: number, newText: string) => void;
  onDismissError: () => void;
}

const BRAILLE_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function TypingIndicator({
  agentName,
}: {
  agentName: string;
}): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % BRAILLE_SPINNER.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hermes-message hermes-message-assistant hermes-typing-indicator">
      <div className="hermes-typing-header">
        <span className="hermes-message-role">{agentName}</span>
        <span className="hermes-typing-status">
          <span className="hermes-typing-spinner">
            {BRAILLE_SPINNER[frame]}
          </span>
          {" Typing"}
        </span>
      </div>
    </div>
  );
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  addon,
  isTyping,
  agentName,
  error,
  messagesContainerRef,
  messagesEndRef,
  messageRefs,
  onEditMessage,
  onDismissError,
}) => {
  return (
    <div
      ref={messagesContainerRef}
      className="hermes-messages"
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: 0,
      }}
    >
      {messages.map((msg, idx) => {
        if (isTyping && msg.role === "assistant" && !msg.content) return null;
        return (
          <div
            key={msg.id}
            ref={(el) => {
              if (el) messageRefs.current.set(msg.id, el);
              else messageRefs.current.delete(msg.id);
            }}
          >
            <ChatMessageItem
              message={msg}
              addon={addon}
              onEditMessage={
                msg.role === "user"
                  ? (newText) => onEditMessage(idx, newText)
                  : undefined
              }
            />
          </div>
        );
      })}
      {isTyping && <TypingIndicator agentName={agentName} />}
      {error && (
        <div className="hermes-error-bar">
          <span>⚠️</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={onDismissError}
            className="hermes-error-bar-close"
          >
            ✕
          </button>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
