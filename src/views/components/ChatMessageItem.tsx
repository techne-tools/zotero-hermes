import React, { memo, useCallback, useState } from "react";
import type Addon from "../../addon";
import { ChatMessage } from "../types";
import { MarkdownRenderer } from "../../utils/MarkdownRenderer";
import {
  CopyIcon,
  EditIcon,
  CheckIcon,
  NoteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AlertIcon,
  StopIcon,
} from "./Icons";
import { stripAnsi } from "../../utils/stripAnsi";

interface ChatMessageItemProps {
  message: ChatMessage;
  addon: Addon;
  onEditMessage?: (newContent: string) => void;
}

const HELIX_FRAMES = ["⢌⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉"];

function HelixSpinner({
  isRunning,
}: {
  isRunning: boolean;
}): React.ReactElement {
  const [frame, setFrame] = useState(0);

  React.useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % HELIX_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isRunning]);

  return <span style={{ fontFamily: "monospace" }}>{HELIX_FRAMES[frame]}</span>;
}

export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  addon,
  onEditMessage,
}: ChatMessageItemProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  // M3: collapse state must be declared unconditionally — putting the
  // useState inside the reasoning/tool branch below violated the rules
  // of hooks (hook count changed between renders for the same component).
  const [isExpanded, setIsExpanded] = useState(!message.isCollapsed);

  const content = stripAnsi(message.content);

  const handleCopy = useCallback(() => {
    try {
      const clipboard = (Components as any).classes[
        "@mozilla.org/widget/clipboardhelper;1"
      ].getService((Components as any).interfaces.nsIClipboardHelper);
      clipboard.copyString(content);
      setIsCopied(true);
      const win = Zotero.getMainWindow();
      win.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [content]);

  const handleSaveNote = useCallback(async () => {
    try {
      const hermes = addon.data.hermes;
      if (!hermes) return;
      const attachedItems = hermes.items.getAttachedItems();
      const parentItemID =
        attachedItems.length > 0 ? attachedItems[0].id : undefined;

      // Simple Markdown to HTML converter
      const lines = content.split("\n");
      let inList = false;
      const htmlParts: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          if (!inList) {
            inList = true;
            htmlParts.push("<ul>");
          }
          htmlParts.push(
            `<li>${trimmed
              .substring(2)
              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`,
          );
        } else {
          if (inList) {
            inList = false;
            htmlParts.push("</ul>");
          }
          if (trimmed.startsWith("# ")) {
            htmlParts.push(`<h1>${trimmed.substring(2)}</h1>`);
          } else if (trimmed.startsWith("## ")) {
            htmlParts.push(`<h2>${trimmed.substring(3)}</h2>`);
          } else if (trimmed.startsWith("### ")) {
            htmlParts.push(`<h3>${trimmed.substring(4)}</h3>`);
          } else if (trimmed.length > 0) {
            htmlParts.push(
              `<p>${trimmed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`,
            );
          }
        }
      }
      if (inList) {
        htmlParts.push("</ul>");
      }

      const contentHtml = htmlParts.join("\n");
      const dateStr = new Date().toLocaleDateString();
      const title = `Hermes Note - ${dateStr}`;

      await hermes.notes.writeNote(null, contentHtml, title, parentItemID);
      setIsSaved(true);
      const win = Zotero.getMainWindow();
      win.setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      addon.log(`Failed to save note: ${(err as Error).message}`);
    }
  }, [addon, content]);

  let roleLabel: React.ReactNode = {
    assistant: "Hermes",
    reasoning: "Reasoning",
    system: "System",
    terminal: "Terminal Output",
    tool: "Tool",
    user: "You",
  }[message.role];

  // Tool role label with spinner
  if (message.role === "tool") {
    const isError = message.toolStatus === "error";
    const isRunning = message.isRunning || message.toolStatus === "running";
    const statusIcon = isError ? <AlertIcon /> : <HelixSpinner isRunning={isRunning} />;
    roleLabel = (
      <>
        {statusIcon}Tool: {message.toolName}
      </>
    );
  }

  // Collapsible reasoning and tool messages
  if (message.role === "reasoning" || message.role === "tool") {
    const toggleExpand = useCallback(() => {
      setIsExpanded((prev) => !prev);
    }, []);
    const isToolRunning =
      message.role === "tool" &&
      (message.isRunning || message.toolStatus === "running");
    const isToolError =
      message.role === "tool" && message.toolStatus === "error";

    return (
      <div
        className={`hermes-message hermes-message-${message.role}${isToolRunning ? " hermes-message-tool-running" : ""}${isToolError ? " hermes-message-tool-error" : ""}`}
      >
        <div className="hermes-message-header">
          <span className="hermes-message-role">{roleLabel}</span>
          <span className="hermes-message-meta">
            <button
              onClick={handleCopy}
              className="hermes-message-action-btn"
              title={isCopied ? "Copied!" : "Copy"}
            >
              {isCopied ? <CheckIcon /> : <CopyIcon />}
            </button>
            <button
              onClick={toggleExpand}
              className="hermes-message-action-btn"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
            <span className="hermes-message-timestamp">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </span>
        </div>
        {isExpanded && (
          <div className="hermes-message-content">
            {message.role === "reasoning" ? (
              <div className="hermes-message-content-reasoning">{content}</div>
            ) : (
              <pre className="hermes-message-content-pre">{content}</pre>
            )}
          </div>
        )}
      </div>
    );
  }

  // Terminal messages
  if (message.role === "terminal") {
    return (
      <div className="hermes-message hermes-message-terminal">
        <div className="hermes-message-header">
          <span className="hermes-message-role">{roleLabel}</span>
          <span className="hermes-message-meta">
            <button
              onClick={handleCopy}
              className="hermes-message-action-btn"
              title="Copy"
            >
              {isCopied ? <CheckIcon /> : <CopyIcon />}
            </button>
            <span className="hermes-message-timestamp">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </span>
        </div>
        <pre className="hermes-terminal-content">{content}</pre>
        {!message.isExited && (
          <button
            onClick={() => {
              /* TODO: abort terminal */
            }}
            className="hermes-abort-btn"
          >
            <StopIcon /> Abort
          </button>
        )}
      </div>
    );
  }

  // System messages
  if (message.role === "system") {
    return (
      <div className="hermes-message hermes-message-system">{content}</div>
    );
  }

  // User and assistant messages
  const isUser = message.role === "user";

  const handleEditSubmit = () => {
    if (editText.trim() && onEditMessage) {
      onEditMessage(editText);
      setIsEditing(false);
    }
  };

  if (isUser && isEditing) {
    return (
      <div className="hermes-message hermes-message-user hermes-message-editing">
        <div className="hermes-message-header">
          <span className="hermes-message-role">{roleLabel}</span>
        </div>
        <div
          className="hermes-message-content"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            width: "100%",
          }}
        >
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{
              width: "100%",
              minHeight: "60px",
              padding: "6px",
              borderRadius: "4px",
              border: "1px solid var(--hermes-border, #ccc)",
              backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
              color: "inherit",
              fontFamily: "inherit",
              fontSize: "inherit",
              resize: "vertical",
            }}
          />
          <div
            style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}
          >
            <button
              onClick={() => setIsEditing(false)}
              className="hermes-small-btn"
              style={{ padding: "4px 8px" }}
            >
              Cancel
            </button>
            <button
              onClick={handleEditSubmit}
              className="hermes-small-btn"
              style={{
                padding: "4px 8px",
                backgroundColor: "var(--hermes-accent, #4a90d9)",
                color: "white",
                border: "none",
                borderRadius: "4px",
              }}
            >
              Save & Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`hermes-message hermes-message-${message.role}`}>
      <div className="hermes-message-header">
        <span className="hermes-message-role">{roleLabel}</span>
        <span className="hermes-message-meta">
          {isUser && onEditMessage && (
            <button
              onClick={() => setIsEditing(true)}
              className="hermes-message-action-btn"
              title="Edit Message"
            >
              <EditIcon />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="hermes-message-action-btn"
            title={isCopied ? "Copied!" : "Copy"}
          >
            {isCopied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {!isUser && (
            <button
              onClick={handleSaveNote}
              className="hermes-message-action-btn"
              title={isSaved ? "Saved as Note!" : "Save to Note"}
            >
              {isSaved ? <CheckIcon /> : <NoteIcon />}
            </button>
          )}
          <span className="hermes-message-timestamp">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </span>
      </div>
      <div className="hermes-message-content">
        {isUser ? (
          <div className="hermes-message-content-text">{content}</div>
        ) : (
          <div className="hermes-message-markdown">
            <MarkdownRenderer text={content} />
          </div>
        )}
      </div>
    </div>
  );
});
