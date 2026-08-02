import React, { useEffect } from "react";
import type { SlashCommand } from "../../modules/hermes/SlashCommands";
import { StopIcon } from "./Icons";

interface InputAreaProps {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  sendBtnRef: React.RefObject<HTMLButtonElement>;
  isTyping: boolean;
  input: string;
  isSlashOpen: boolean;
  slashSuggestions: SlashCommand[];
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
  slashDropdownRef,
  onSelectSuggestion,
}) => {
  return (
    <div className="hermes-input-area">
      {isSlashOpen && slashSuggestions.length > 0 && (
        <div className="hermes-slash-dropdown" ref={slashDropdownRef}>
          {slashSuggestions.map((cmd) => (
            <button key={cmd.name} onClick={() => onSelectSuggestion(cmd)}>
              /{cmd.name} - {cmd.description}
            </button>
          ))}
        </div>
      )}
      <div className="hermes-input-row">
        <textarea ref={inputRef} placeholder="Message Hermes..." />
        <button ref={sendBtnRef} disabled={!input.trim() || isTyping}>
          {isTyping ? <StopIcon /> : "Send"}
        </button>
      </div>
    </div>
  );
};
