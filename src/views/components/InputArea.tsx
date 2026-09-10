import React from "react";
import type { SlashCommand } from "../../modules/hermes/SlashCommands";
import { StopIcon } from "./Icons";

interface InputAreaProps {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  sendBtnRef: React.RefObject<HTMLButtonElement>;
  isTyping: boolean;
  input: string;
  isSlashOpen: boolean;
  slashSuggestions: SlashCommand[];
  slashSelectionIndex: number;
  slashDropdownRef: React.RefObject<HTMLDivElement>;
  onSelectSuggestion: (cmd: SlashCommand) => void;
}

export const InputArea: React.FC<InputAreaProps> = ({
  inputRef,
  sendBtnRef,
  isTyping,
  input,
  isSlashOpen,
  slashSuggestions,
  slashSelectionIndex,
  slashDropdownRef,
  onSelectSuggestion,
}) => {
  return (
    <div
      className="hermes-input-area"
      style={{
        padding: "8px",
        borderTop: "1px solid var(--hermes-border, #e0e0e0)",
        backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
      }}
    >
      {/* Slash command dropdown */}
      {isSlashOpen && slashSuggestions.length > 0 && (
        <div className="hermes-slash-dropdown" ref={slashDropdownRef}>
          {slashSuggestions.map((cmd, idx) => (
            <button
              key={cmd.name}
              className={`hermes-slash-item${idx === slashSelectionIndex ? " hermes-slash-item-selected" : ""}`}
              onClick={() => onSelectSuggestion(cmd)}
            >
              <span className="hermes-slash-item-name">/{cmd.name}</span>
              <span className="hermes-slash-item-desc">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className="hermes-input-row"
        style={{
          display: "flex",
          gap: "6px",
          alignItems: "center",
          padding: "0 8px",
        }}
      >
        <textarea
          ref={inputRef}
          defaultValue={input}
          placeholder="Message Hermes..."
          rows={1}
          className="hermes-textarea"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            resize: "none",
            padding: "8px 0",
            backgroundColor: "transparent",
            color: "inherit",
            fontFamily: "inherit",
            fontSize: "0.9em",
            lineHeight: 1.5,
          }}
        />
        <button
          ref={sendBtnRef}
          disabled={!input.trim()}
          className="hermes-send-btn"
          style={{
            padding: "6px 16px",
            border: "none",
            borderRadius: "6px",
            backgroundColor: "var(--hermes-accent, #4a90d9)",
            color: "white",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.85em",
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            opacity: !input.trim() ? 0.5 : 1,
          }}
        >
          {isTyping ? <StopIcon /> : "Send"}
        </button>
      </div>
    </div>
  );
};
