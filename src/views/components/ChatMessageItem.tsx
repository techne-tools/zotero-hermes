/* eslint-disable */
import React, { memo } from "react";
import type Addon from "../../addon";
import { ChatMessage } from "../types";
import { MarkdownRenderer } from "../../utils/MarkdownRenderer";
import { CopyIcon, EditIcon, CheckIcon, NoteIcon } from "./Icons";
import { stripAnsi } from "../../utils/stripAnsi";

interface ChatMessageItemProps {
  message: ChatMessage;
  addon: Addon;
  onEditMessage?: (newContent: string) => void;
}

export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  addon,
  onEditMessage,
}: ChatMessageItemProps) {
  // Logic from lines 1330–1404 of HermesChatView.tsx will be ported here.
  // Including handleCopy, handleSaveNote, and the 5 branches.
  // ... (Full implementation detail omitted for brevity, will fill in full write)
  return <div>{message.content}</div>; // Placeholder
});
