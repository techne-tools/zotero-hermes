import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

import type {
  ChatSessionUpdate,
  PromptContextItem,
} from "../modules/hermes/HermesClient";
import type Addon from "../addon";

import { useStreamBuffer } from "./useStreamBuffer";
import {
  getSlashCommands,
  parseSlashCommand,
} from "../modules/hermes/SlashCommands";

export interface ChatMessage {
  content: string;
  id: string;
  isExited?: boolean;
  role:
    | "assistant"
    | "reasoning"
    | "system"
    | "terminal"
    | "tool"
    | "user";
  terminalId?: string;
  timestamp: number;
  toolCallId?: string;
}

export interface ContextItem {
  id: string;
  type: "item" | "selection" | "note";
  text: string;
  data?: Zotero.Item;
}

interface HermesChatViewProps {
  addon: Addon;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][0-9;]*[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[()[\]{}#~%@\^=\/>!]/g, "")
    .replace(/\x1b\x1b/g, "");
}

/**
 * Determine if a CSS color value represents a dark color.
 */
function isDarkColor(color: string): boolean {
  // Parse rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    // Perceived brightness formula
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }
  // Named colors: treat transparent as light
  if (color === "transparent" || color === "rgba(0, 0, 0, 0)") {
    return false;
  }
  // Default to light for unknown
  return false;
}

export function HermesChatViewComponent({ addon }: HermesChatViewProps) {
  addon.log("HermesChatViewComponent: React component rendering");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [allowedTools, setAllowedTools] = useState<string[] | null>(null);
  const [isConversationListOpen, setIsConversationListOpen] = useState(false);
  const [conversations, setConversations] = useState<
    Array<{ id: string; title: string; updatedAt: number }>
  >([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const lastSendTimeRef = useRef<number>(0);
  const RATE_LIMIT_MS = 2000;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Native DOM input listener: React synthetic onChange is unreliable in Zotero's sandboxed Firefox
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const handleNativeInput = (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      setInput(target.value);
    };

    textarea.addEventListener("input", handleNativeInput);
    return () => {
      textarea.removeEventListener("input", handleNativeInput);
    };
  }, []);

  // Guard: Hermes modules not initialized yet
  const hermes = addon.data.hermes;
  if (!hermes) {
    return (
      <div style={chatViewStyle}>
        <div style={headerStyle}>Hermes Agent</div>
        <div style={{ padding: "16px", opacity: 0.7 }}>
          Initializing Hermes modules...
        </div>
      </div>
    );
  }

  const settings = hermes.preferences;

  const {
    appendContent,
    appendReasoning,
    flushNow,
    reasoningMessageIdRef,
    streamingMessageIdRef,
  } = useStreamBuffer(setMessages, settings.get("showReasoning", true));

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Subscribe to Hermes client updates
  useEffect(() => {
    const client = hermes.client;

    const handleUpdate = (update: ChatSessionUpdate) => {
      if (update.type === "message" && update.content) {
        appendContent(update.content);
        setIsTyping(true);
      } else if (update.type === "stop") {
        flushNow();
        setIsTyping(false);
        streamingMessageIdRef.current = null;
        reasoningMessageIdRef.current = null;
      } else if (update.type === "reasoning" && update.reasoning) {
        if (settings.get("showReasoning", true)) {
          appendReasoning(update.reasoning);
        }
      } else if (
        update.type === "tool_start" ||
        update.type === "tool_progress" ||
        update.type === "tool_complete"
      ) {
        flushNow();
        if (update.toolCall) {
          const toolMsg = `🔧 **${update.toolCall.name}** (${update.toolCall.status})${update.toolCall.result ? `: ${update.toolCall.result}` : ""}`;
          setMessages((prev) => [
            ...prev,
            {
              id: generateMessageId(),
              content: toolMsg,
              role: "tool",
              timestamp: Date.now(),
              toolCallId: update.toolCall?.callId,
            },
          ]);
        }
      } else if (update.type === "terminal_output" && update.terminal) {
        flushNow();
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            content: update.terminal!.output,
            role: "terminal",
            timestamp: Date.now(),
            terminalId: update.terminal!.id,
            isExited: update.terminal!.isExited,
          },
        ]);
      } else if (update.type === "usage" && update.usage) {
        flushNow();
        const usageMsg = `📊 Tokens: ${update.usage.inputTokens} in, ${update.usage.outputTokens} out, ${update.usage.totalTokens} total`;
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            content: usageMsg,
            role: "system",
            timestamp: Date.now(),
          },
        ]);
      } else if (update.type === "error") {
        setError(update.content || "An error occurred");
        setIsTyping(false);
      }
    };

    const handleError = (err: Error) => {
      setError(err.message);
      setIsTyping(false);
    };

    client.onUpdate(handleUpdate);
    client.onError(handleError);

    return () => {
      client.onUpdate(() => {});
      client.onError(() => {});
    };
  }, [hermes.client, appendContent, appendReasoning, flushNow, settings, streamingMessageIdRef, reasoningMessageIdRef]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    const now = Date.now();
    if (now - lastSendTimeRef.current < RATE_LIMIT_MS) {
      setError("Please wait a moment before sending another message.");
      return;
    }
    lastSendTimeRef.current = now;
    setError(null);

    // Check for slash commands
    const slashCmd = parseSlashCommand(text);
    if (slashCmd) {
      setInput("");
      
      // Add user message
      const userMsg: ChatMessage = {
        id: generateMessageId(),
        content: text,
        role: "user",
        timestamp: now,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Handle built-in /clear command
      if (slashCmd.command.name === "clear") {
        setMessages([]);
        setContextItems([]);
        hermes.chat.clearMessages();
        hermes.conversations.createConversation();
        return;
      }

      // Execute slash command
      try {
        const result = await slashCmd.command.execute(addon, slashCmd.args);
        if (result) {
          const systemMsg: ChatMessage = {
            id: generateMessageId(),
            content: result,
            role: "system",
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, systemMsg]);
        } else {
          // Forward to Hermes as a prompt
          await sendToHermes(text);
        }
      } catch (err) {
        const errorMsg: ChatMessage = {
          id: generateMessageId(),
          content: `Error executing /${slashCmd.command.name}: ${(err as Error).message}`,
          role: "system",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
      return;
    }

    // Regular message - send to Hermes
    await sendToHermes(text);
  }, [input, addon, hermes.chat, hermes.conversations]);

  const sendToHermes = useCallback(async (text: string) => {
    // Add user message
    const userMsg: ChatMessage = {
      id: generateMessageId(),
      content: text,
      role: "user",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Ensure connection
    const client = hermes.client;
    if (!client.getIsConnected()) {
      try {
        await client.connect();
      } catch (err) {
        setError(`Connection failed: ${(err as Error).message}`);
        setIsTyping(false);
        return;
      }
    }

    // Convert context items to PromptContextItem format
    const promptContextItems: PromptContextItem[] = contextItems.map((item) => ({
      id: item.id,
      type: item.type,
      text: item.text,
      data: item.data ? JSON.stringify(item.data.toJSON()) : undefined,
    }));

    // Send to Hermes
    try {
      await client.sendPrompt(text, promptContextItems, { allowedTools });
    } catch (err) {
      setError(`Send failed: ${(err as Error).message}`);
      setIsTyping(false);
    }
  }, [hermes.client, contextItems, allowedTools]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage],
  );

  const attachSelectedItems = useCallback(() => {
    const items = hermes.items.getSelectedItems();
    if (items.length === 0) {
      setError("No items selected in Zotero library.");
      return;
    }
    setContextItems((prev) => {
      const newItems = items
        .map((item) => ({
          id: `item-${item.id}`,
          type: "item" as const,
          text: item.getDisplayTitle(),
          data: item,
        }))
        .filter((item) => !prev.some((p) => p.id === item.id));
      return [...prev, ...newItems];
    });
  }, [hermes.items]);

  const clearContext = useCallback(() => {
    setContextItems([]);
    hermes.items.clearAttachedItems();
  }, [hermes.items]);

  const loadConversationList = useCallback(() => {
    const allConvs = hermes.conversations.loadAllConversations();
    setConversations(
      allConvs.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
      })),
    );
  }, [hermes.conversations]);

  const handleLoadConversation = useCallback(
    (id: string) => {
      const conv = hermes.conversations.loadConversation(id);
      if (conv) {
        setMessages(conv.messages || []);
        setContextItems([]);
        setError(null);
        hermes.chat.loadFromConversation(conv);
        setIsConversationListOpen(false);
      }
    },
    [hermes.conversations, hermes.chat],
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      hermes.conversations.deleteConversation(id);
      loadConversationList();
      if (messages.length > 0) {
        setMessages([]);
        setContextItems([]);
      }
    },
    [hermes.conversations, loadConversationList, messages.length],
  );

  const saveCurrentConversation = useCallback(
    (title?: string, tools?: string[] | null) => {
      const conv = hermes.conversations.getCurrentConversation();
      if (conv) {
        conv.messages = messages;
        if (title) conv.title = title;
        if (tools !== undefined) conv.allowedTools = tools;
        hermes.conversations.saveConversation(conv);
      }
    },
    [hermes.conversations, messages],
  );

  const exportToHtml = useCallback(async (): Promise<void> => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Hermes Conversation</title></head>
<body>
<h1>Hermes Conversation</h1>
${messages
  .map(
    (m) => `
<div style="margin: 1em 0; padding: 0.5em; background: ${m.role === "user" ? "#e3f2fd" : "#f5f5f5"}; border-radius: 4px;">
  <strong>${m.role.toUpperCase()}</strong>
  <p>${m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
</div>`,
  )
  .join("\n")}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = Zotero.getMainWindow();
    const a = win.document.createElement("a");
    a.href = url;
    a.download = `hermes-conversation-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  const exportToJson = useCallback(() => {
    const json = JSON.stringify(messages, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const win = Zotero.getMainWindow();
    const a = win.document.createElement("a");
    a.href = url;
    a.download = `hermes-conversation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  const exportToMarkdown = useCallback(() => {
    const md = messages
      .map((m) => `## ${m.role.toUpperCase()}\n\n${m.content}`)
      .join("\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const win = Zotero.getMainWindow();
    const a = win.document.createElement("a");
    a.href = url;
    a.download = `hermes-conversation-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  const performSearch = useCallback((query: string): void => {
    if (!query.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      return;
    }
    const lower = query.toLowerCase();
    const indices: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.content.toLowerCase().includes(lower)) {
        indices.push(idx);
      }
    });
    setSearchMatches(indices);
    setCurrentMatchIndex(indices.length > 0 ? 0 : 0);
  }, [messages]);

  const jumpToMatch = useCallback(
    (direction: "next" | "prev"): void => {
      if (searchMatches.length === 0) return;
      const newIndex =
        direction === "next"
          ? (currentMatchIndex + 1) % searchMatches.length
          : (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
      setCurrentMatchIndex(newIndex);
      const msgIndex = searchMatches[newIndex];
      if (msgIndex !== undefined) {
        const msgId = messages[msgIndex]?.id;
        const el = msgId ? messageRefs.current.get(msgId) : undefined;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("hermes-search-highlight");
          const win = Zotero.getMainWindow();
          win.setTimeout(() => {
            el.classList.remove("hermes-search-highlight");
          }, 2000);
        }
      }
    },
    [searchMatches, currentMatchIndex, messages],
  );

  const newChat = useCallback(() => {
    setMessages([]);
    setContextItems([]);
    setError(null);
    hermes.chat.clearMessages();
    hermes.conversations.createConversation();
  }, [hermes.chat, hermes.conversations]);

  return (
    <div className="hermes-chat-view" style={chatViewStyle}>
      {/* Header */}
      <div className="hermes-chat-header" style={headerStyle}>
        <span style={{ fontWeight: 600 }}>Hermes Agent</span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => {
              loadConversationList();
              setIsConversationListOpen((prev) => !prev);
            }}
            style={iconBtnStyle}
            title="Previous Conversations"
          >
            📋
          </button>
          <button
            onClick={() => {
              setIsSearchOpen((prev) => !prev);
              if (!isSearchOpen) {
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }
            }}
            style={iconBtnStyle}
            title="Search (Ctrl+F)"
          >
            🔍
          </button>
          <button
            onClick={exportToHtml}
            style={iconBtnStyle}
            title="Export as HTML"
          >
            📄
          </button>
          <button
            onClick={exportToJson}
            style={iconBtnStyle}
            title="Export as JSON"
          >
            📦
          </button>
          <button
            onClick={exportToMarkdown}
            style={iconBtnStyle}
            title="Export as Markdown"
          >
            📝
          </button>
          <button onClick={newChat} style={iconBtnStyle} title="New Chat">
            🆕
          </button>
          <button
            onClick={attachSelectedItems}
            style={iconBtnStyle}
            title="Attach Selected Items"
          >
            📎
          </button>
        </div>
      </div>

      {/* Conversation List */}
      {isConversationListOpen && (
        <div
          style={{
            padding: "8px",
            borderBottom: "1px solid var(--hermes-border, #ccc)",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <strong>Previous Conversations</strong>
            <button
              onClick={() => setIsConversationListOpen(false)}
              style={smallBtnStyle}
            >
              ✕
            </button>
          </div>
          {conversations.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No saved conversations</div>
          ) : (
            <ul style={{ margin: 0, padding: "0 0 0 1em" }}>
              {conversations.slice(0, 10).map((conv) => (
                <li
                  key={conv.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <button
                    onClick={() => handleLoadConversation(conv.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "inherit",
                      textDecoration: "underline",
                      padding: 0,
                      textAlign: "left",
                    }}
                  >
                    {conv.title}
                  </button>
                  <button
                    onClick={() => handleDeleteConversation(conv.id)}
                    style={{
                      ...smallBtnStyle,
                      color: "red",
                      padding: "0 4px",
                    }}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Search Bar */}
      {isSearchOpen && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px",
            borderBottom: "1px solid var(--hermes-border, #ccc)",
          }}
        >
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              performSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                jumpToMatch("next");
              } else if (e.key === "Escape") {
                setIsSearchOpen(false);
                setSearchQuery("");
                setSearchMatches([]);
              }
            }}
            placeholder="Search messages..."
            style={{
              flex: 1,
              padding: "4px 8px",
              border: "1px solid var(--hermes-border, #ccc)",
              borderRadius: "4px",
              backgroundColor: "var(--hermes-input-bg, #fff)",
              color: "inherit",
            }}
          />
          {searchMatches.length > 0 && (
            <span style={{ fontSize: "0.8em", opacity: 0.7 }}>
              {currentMatchIndex + 1} / {searchMatches.length}
            </span>
          )}
          <button
            onClick={() => jumpToMatch("prev")}
            style={iconBtnStyle}
            title="Previous"
          >
            ↑
          </button>
          <button
            onClick={() => jumpToMatch("next")}
            style={iconBtnStyle}
            title="Next"
          >
            ↓
          </button>
          <button
            onClick={() => {
              setIsSearchOpen(false);
              setSearchQuery("");
              setSearchMatches([]);
            }}
            style={iconBtnStyle}
            title="Close"
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="hermes-messages" style={messagesStyle}>
        {messages.map((msg) => (
          <ChatMessageItem key={msg.id} message={msg} />
        ))}
        {isTyping && (
          <div style={typingIndicatorStyle}>
            <div className="hermes-typing-dots">
              <span /><span /><span />
            </div>
          </div>
        )}
        {error && (
          <div style={errorStyle}>
            ⚠️ {error}
            <button
              onClick={() => setError(null)}
              style={{
                marginLeft: "8px",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Context bar */}
      {contextItems.length > 0 && (
        <div style={contextBarStyle}>
          <span>📚 {contextItems.length} item(s) attached</span>
          <button onClick={clearContext} style={smallBtnStyle}>
            Clear
          </button>
        </div>
      )}

      {/* Input */}
      <div className="hermes-input-area" style={inputAreaStyle}>
        <textarea
          ref={inputRef}
          defaultValue={input}
          onKeyDown={handleKeyDown}
          placeholder="Ask Hermes about your research..."
          rows={3}
          style={textareaStyle}
        />
        <button
          onClick={() => void sendMessage()}
          disabled={!input.trim() || isTyping}
          style={{
            ...sendBtnStyle,
            opacity: !input.trim() || isTyping ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

const ChatMessageItem = memo(function ChatMessageItem({
  message,
}: {
  message: ChatMessage;
}) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      style={{
        ...messageBubbleStyle,
        alignSelf: isUser ? "flex-end" : "flex-start",
        backgroundColor: isUser
          ? "var(--hermes-accent, #4a90d9)"
          : "var(--hermes-bg-secondary, #f5f5f5)",
        color: isUser ? "var(--hermes-accent-text, white)" : "inherit",
      }}
    >
      <div style={{ fontSize: "0.75em", opacity: 0.7, marginBottom: "4px" }}>
        {isUser ? "You" : isAssistant ? "Hermes" : message.role}
        {" "}
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
        {stripAnsi(message.content)}
      </div>
    </div>
  );
});

// --- Inline Styles ---

const chatViewStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: "var(--hermes-bg, #fff)",
  color: "var(--hermes-text, #333)",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "14px",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  borderBottom: "1px solid var(--hermes-border, #e0e0e0)",
  backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const messageBubbleStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  maxWidth: "85%",
  wordBreak: "break-word",
};

const typingIndicatorStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "8px 16px",
  opacity: 0.6,
};

const errorStyle: React.CSSProperties = {
  alignSelf: "center",
  padding: "8px 12px",
  backgroundColor: "var(--hermes-bg-tertiary, #ffebee)",
  color: "var(--hermes-text, #c62828)",
  borderRadius: "8px",
  fontSize: "0.9em",
};

const contextBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 16px",
  backgroundColor: "var(--hermes-bg-tertiary, #f0f0f0)",
  borderTop: "1px solid var(--hermes-border, #e0e0e0)",
  fontSize: "0.85em",
};

const inputAreaStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  padding: "12px 16px",
  borderTop: "1px solid var(--hermes-border, #e0e0e0)",
  backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: "none",
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid var(--hermes-border, #ccc)",
  fontFamily: "inherit",
  fontSize: "14px",
  backgroundColor: "var(--hermes-input-bg, #fff)",
  color: "inherit",
};

const sendBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  backgroundColor: "var(--hermes-accent, #4a90d9)",
  color: "var(--hermes-accent-text, white)",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: 600,
};

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "16px",
  padding: "4px",
  color: "inherit",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: "0.8em",
  backgroundColor: "var(--hermes-bg, #fff)",
  border: "1px solid var(--hermes-border, #ccc)",
  borderRadius: "4px",
  cursor: "pointer",
  color: "inherit",
};

/**
 * Mount the Hermes Chat React app into a DOM container.
 * Call this from the Zotero sidebar onReady callback.
 */
export function mountHermesChat(
  container: HTMLElement,
  addonInstance: Addon,
): () => void {
  // Ensure browser globals are available for React in Zotero sandbox
  const win = container.ownerDocument?.defaultView;
  if (win) {
    if (typeof (globalThis as any).window === "undefined") {
      (globalThis as any).window = win;
    }
    if (typeof (globalThis as any).document === "undefined") {
      (globalThis as any).document = win.document;
    }
    if (typeof (globalThis as any).navigator === "undefined") {
      (globalThis as any).navigator = win.navigator;
    }
  }

  // Detect dark mode from OS + Zotero
  let isDark = false;
  const doc = container.ownerDocument;
  try {
    // Method 1: OS dark mode via matchMedia
    const mq = win?.matchMedia?.("(prefers-color-scheme: dark)");
    if (mq && mq.matches) {
      isDark = true;
      addonInstance.log("Hermes theme: detected dark via matchMedia");
    }

    // Method 2: Check Zotero main window background color
    if (!isDark) {
      const mainWindow = doc?.getElementById("main-window");
      if (mainWindow && win) {
        const style = win.getComputedStyle(mainWindow);
        const bg = style?.backgroundColor || "";
        if (isDarkColor(bg)) {
          isDark = true;
          addonInstance.log("Hermes theme: detected dark via main-window bg");
        }
      }
    }

    // Method 3: Check document element classes/attributes
    if (!isDark && doc?.documentElement) {
      const htmlClass = doc.documentElement.className || "";
      const htmlAttr = doc.documentElement.getAttribute("data-theme") || "";
      if (htmlClass.includes("dark") || htmlClass.includes("theme-dark") || htmlAttr.includes("dark")) {
        isDark = true;
        addonInstance.log("Hermes theme: detected dark via document class/attr");
      }
    }
  } catch (e) {
    addonInstance.log(`Hermes theme detection error: ${(e as Error).message}`);
  }

  addonInstance.log(`Hermes theme: isDark=${isDark}`);

  // Apply theme directly to container element — most reliable in XUL sandbox.
  // CSS custom properties set via inline style are inherited by all children.
  const theme = {
    bg: isDark ? "#1e1e1e" : "#ffffff",
    text: isDark ? "#f0f0f0" : "#333333",
    border: isDark ? "rgba(255,255,255,0.18)" : "#e0e0e0",
    bgSecondary: isDark ? "#272727" : "#fafafa",
    bgTertiary: isDark ? "#303030" : "#f0f0f0",
    inputBg: isDark ? "#303030" : "#ffffff",
    accent: "#4a90d9",
    accentText: "#ffffff",
  };

  container.style.setProperty("--hermes-bg", theme.bg);
  container.style.setProperty("--hermes-text", theme.text);
  container.style.setProperty("--hermes-border", theme.border);
  container.style.setProperty("--hermes-bg-secondary", theme.bgSecondary);
  container.style.setProperty("--hermes-bg-tertiary", theme.bgTertiary);
  container.style.setProperty("--hermes-input-bg", theme.inputBg);
  container.style.setProperty("--hermes-accent", theme.accent);
  container.style.setProperty("--hermes-accent-text", theme.accentText);

  // Explicitly set container background/color so something shows even if
  // CSS variable inheritance fails inside the React tree.
  container.style.backgroundColor = theme.bg;
  container.style.color = theme.text;
  container.style.colorScheme = isDark ? "dark" : "light";

  // Inject CSS via CSSOM insertRule — the only reliable method in XUL documents
  // where textContent/innerHTML on <style> elements don't persist.
  if (doc) {
    const existing = doc.getElementById("hermes-theme-style");
    if (existing) existing.remove();
    const styleEl = doc.createElement("style");
    styleEl.setAttribute("id", "hermes-theme-style");
    styleEl.setAttribute("type", "text/css");
    const parent = doc.documentElement || doc.head || doc.body;
    if (parent) {
      parent.appendChild(styleEl);
      addonInstance.log("Hermes theme: style tag appended to " + parent.nodeName);
      // Use CSSOM to insert the rule — works in XUL where innerHTML doesn't
      const sheet = (styleEl as any).sheet;
      if (sheet && sheet.insertRule) {
        const rule = `
          #hermes-react-root {
            --hermes-bg: ${theme.bg};
            --hermes-text: ${theme.text};
            --hermes-border: ${theme.border};
            --hermes-bg-secondary: ${theme.bgSecondary};
            --hermes-bg-tertiary: ${theme.bgTertiary};
            --hermes-input-bg: ${theme.inputBg};
            --hermes-accent: ${theme.accent};
            --hermes-accent-text: ${theme.accentText};
            background-color: ${theme.bg} !important;
            color: ${theme.text} !important;
            color-scheme: ${isDark ? "dark" : "light"};
          }
        `;
        sheet.insertRule(rule, 0);
        addonInstance.log("Hermes theme: CSSOM insertRule succeeded, rules=" + sheet.cssRules.length);
      } else {
        addonInstance.log("Hermes theme: WARNING — sheet or insertRule not available");
      }
    } else {
      addonInstance.log("Hermes theme: WARNING — no parent element found for style tag");
    }
  }

  // Listen for OS theme changes and update dynamically
  try {
    const mq = win?.matchMedia?.("(prefers-color-scheme: dark)");
    if (mq) {
      const onThemeChange = (e: MediaQueryListEvent) => {
        addonInstance.log(`Hermes theme: OS theme changed to ${e.matches ? "dark" : "light"}`);
        const newIsDark = e.matches;
        const newTheme = {
          bg: newIsDark ? "#1e1e1e" : "#ffffff",
          text: newIsDark ? "#f0f0f0" : "#333333",
          border: newIsDark ? "rgba(255,255,255,0.18)" : "#e0e0e0",
          bgSecondary: newIsDark ? "#272727" : "#fafafa",
          bgTertiary: newIsDark ? "#303030" : "#f0f0f0",
          inputBg: newIsDark ? "#303030" : "#ffffff",
          accent: "#4a90d9",
          accentText: "#ffffff",
        };
        container.style.setProperty("--hermes-bg", newTheme.bg);
        container.style.setProperty("--hermes-text", newTheme.text);
        container.style.setProperty("--hermes-border", newTheme.border);
        container.style.setProperty("--hermes-bg-secondary", newTheme.bgSecondary);
        container.style.setProperty("--hermes-bg-tertiary", newTheme.bgTertiary);
        container.style.setProperty("--hermes-input-bg", newTheme.inputBg);
        container.style.backgroundColor = newTheme.bg;
        container.style.color = newTheme.text;
        container.style.colorScheme = newIsDark ? "dark" : "light";
      };
      mq.addEventListener("change", onThemeChange);
    }
  } catch (e) {
    // ignore
  }

  addonInstance.log(`Hermes theme: container innerHTML before render = "${(container.innerHTML as string).slice(0, 80)}..."`);

  let root: ReturnType<typeof createRoot> | null = null;
  try {
    root = createRoot(container);
    addonInstance.log("Hermes theme: createRoot succeeded");
  } catch (err) {
    addonInstance.log(`Hermes theme: createRoot FAILED: ${(err as Error).message}`);
    container.innerHTML = `<div style="padding:16px;color:red">createRoot error: ${(err as Error).message}</div>`;
    return () => {};
  }

  try {
    root.render(<HermesChatViewComponent addon={addonInstance} />);
    addonInstance.log("Hermes theme: root.render() called successfully");
  } catch (err) {
    addonInstance.log(`Hermes theme: root.render() FAILED: ${(err as Error).message}`);
    container.innerHTML = `<div style="padding:16px;color:red">Render error: ${(err as Error).message}</div>`;
  }

  return () => {
    addonInstance.log("Hermes theme: unmounting React root");
    root?.unmount();
  };
}
