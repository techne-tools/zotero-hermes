import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  ChatSessionUpdate,
  PromptContextItem,
} from "../modules/hermes/types";
import type Addon from "../addon";

import { useStreamBuffer } from "./useStreamBuffer";
import { generateMessageId } from "../utils/uuid";
import { stripAnsi } from "../utils/stripAnsi";
import { MarkdownRenderer } from "../utils/MarkdownRenderer";
import {
  getSlashCommands,
  parseSlashCommand,
} from "../modules/hermes/SlashCommands";
import type { SlashCommand } from "../modules/hermes/SlashCommands";

export interface ChatMessage {
  content: string;
  id: string;
  isCollapsed?: boolean;
  isExited?: boolean;
  isRunning?: boolean;
  role: "assistant" | "reasoning" | "system" | "terminal" | "tool" | "user";
  terminalId?: string;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
  toolStatus?: "complete" | "error" | "running";
}

export interface ContextItem {
  id: string;
  type: "item" | "selection" | "note";
  text: string;
  data?: Zotero.Item;
  extracted?: import("../modules/hermes/ItemManager").AttachedItem | null;
}

interface HermesChatViewProps {
  addon: Addon;
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

// ─── SVG Icons (matching Obsidian plugin) ───

const SearchIcon = () => (
  <svg
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="16"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const MenuIcon = () => (
  <svg
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="16"
  >
    <path d="M3 12h18M3 6h18M3 18h18" />
  </svg>
);

const PlusIcon = () => (
  <svg
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="16"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const SettingsIcon = () => (
  <svg
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="16"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CopyIcon = () => (
  <svg
    fill="none"
    height="12"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="12"
  >
    <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const EditIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="12"
    height="12"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
  </svg>
);

const CheckIcon = () => (
  <svg
    fill="none"
    height="12"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="12"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg
    fill="none"
    height="12"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="12"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg
    fill="none"
    height="12"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="12"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const StopIcon = () => (
  <svg
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="16"
  >
    <rect height="12" width="12" x="6" y="6" />
  </svg>
);

const AttachIcon = () => (
  <svg
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="16"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.9" />
  </svg>
);

const CloseIcon = () => (
  <svg
    fill="none"
    height="12"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="12"
  >
    <line x1="18" x2="6" y1="6" y2="18" />
    <line x1="6" x2="18" y1="6" y2="18" />
  </svg>
);

const NoteIcon = () => (
  <svg
    fill="none"
    height="12"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="12"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" x2="8" y1="13" y2="13" />
    <line x1="16" x2="8" y1="17" y2="17" />
  </svg>
);

const HELIX_FRAMES = ["⢌⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉"];

function HelixSpinner({
  isRunning,
}: {
  isRunning: boolean;
}): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % HELIX_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isRunning]);

  return <span style={{ fontFamily: "monospace" }}>{HELIX_FRAMES[frame]}</span>;
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

  // Session settings state
  const [isSessionSettingsOpen, setIsSessionSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<{
    input: number;
    output: number;
    total: number;
  } | null>(null);

  // Onboarding state — initialised as true, corrected after settings is available
  const [showOnboarding, setShowOnboarding] = useState(true);

  // Slash command autocomplete state
  const [slashSuggestions, setSlashSuggestions] = useState<SlashCommand[]>([]);
  const [isSlashOpen, setIsSlashOpen] = useState(false);
  const [slashSelectionIndex, setSlashSelectionIndex] = useState(0);
  const slashDropdownRef = useRef<HTMLDivElement>(null);

  const lastSendTimeRef = useRef<number>(0);
  const RATE_LIMIT_MS = 2000;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref to latest state for native event callbacks
  const stateRef = useRef({
    input: "",
    messages,
    contextItems,
    allowedTools,
    isTyping,
    isConversationListOpen,
    isSearchOpen,
    searchQuery,
    searchMatches,
    currentMatchIndex,
    conversations,
    error,
  });
  useEffect(() => {
    stateRef.current = {
      input,
      messages,
      contextItems,
      allowedTools,
      isTyping,
      isConversationListOpen,
      isSearchOpen,
      searchQuery,
      searchMatches,
      currentMatchIndex,
      conversations,
      error,
    };
  }, [
    input,
    messages,
    contextItems,
    allowedTools,
    isTyping,
    isConversationListOpen,
    isSearchOpen,
    searchQuery,
    searchMatches,
    currentMatchIndex,
    conversations,
    error,
  ]);

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

  // Correct onboarding state now that settings is available
  useEffect(() => {
    setShowOnboarding(!settings.get("hasSeenOnboarding", false));
  }, [settings]);

  const {
    appendContent,
    appendReasoning,
    flushNow,
    reasoningMessageIdRef,
    streamingMessageIdRef,
  } = useStreamBuffer(
    setMessages,
    settings.get("showReasoning", true),
    settings.get("enableTypingSound", false),
    settings.get("enableHapticFeedback", false),
  );

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ─── Send Logic ───
  const sendToHermes = useCallback(
    async (text: string) => {
      addon.log("[ChatView] sendToHermes called with text:", text.slice(0, 60));
      const st = stateRef.current;
      const streamingMessageId = generateMessageId();
      streamingMessageIdRef.current = streamingMessageId;
      reasoningMessageIdRef.current = null;

      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          content: text,
          role: "user",
          timestamp: Date.now(),
        },
        {
          content: "",
          id: streamingMessageId,
          role: "assistant",
          timestamp: Date.now(),
        },
      ]);
      setInput("");
      setIsTyping(true);

      // Haptic feedback when agent starts responding
      if (
        settings.get("enableHapticFeedback", false) &&
        typeof navigator !== "undefined" &&
        navigator.vibrate
      ) {
        navigator.vibrate(50);
      }

      // Safety timeout: clear typing indicator after 60s if no stop/session_info arrives
      typingTimeoutRef.current = setTimeout(() => {
        addon.log("[ChatView] Typing timeout reached, clearing indicator");
        setIsTyping(false);
        streamingMessageIdRef.current = null;
        reasoningMessageIdRef.current = null;
      }, 60000);

      const client = hermes.client;
      addon.log(
        "[ChatView] client type:",
        client.constructor.name,
        "connected:",
        client.getIsConnected(),
      );
      if (!client.getIsConnected()) {
        try {
          addon.log("[ChatView] Connecting client...");
          await client.connect();
          addon.log("[ChatView] Client connected successfully");
        } catch (err) {
          addon.log("[ChatView] Connection failed:", (err as Error).message);
          setError(`Connection failed: ${(err as Error).message}`);
          setIsTyping(false);
          streamingMessageIdRef.current = null;
          return;
        }
      }

      const promptContextItems: PromptContextItem[] = st.contextItems.map(
        (item) => ({
          id: item.id,
          type: item.type,
          text: item.text,
          data: item.data ? JSON.stringify(item.data.toJSON()) : undefined,
          extracted: item.extracted
            ? (item.extracted as unknown as Record<string, unknown>)
            : undefined,
        }),
      );

      try {
        addon.log("[ChatView] Calling client.sendPrompt...");
        await client.sendPrompt(text, promptContextItems, {
          allowedTools: st.allowedTools,
        });
        addon.log("[ChatView] client.sendPrompt returned");
      } catch (err) {
        addon.log("[ChatView] sendPrompt failed:", (err as Error).message);
        setError(`Send failed: ${(err as Error).message}`);
        setIsTyping(false);
        streamingMessageIdRef.current = null;
      }
    },
    [hermes.client, addon],
  );

  const resendFromIndex = useCallback(
    async (index: number, newText: string) => {
      addon.log("[ChatView] resendFromIndex called at index:", index);
      const st = stateRef.current;

      const streamingMessageId = generateMessageId();
      streamingMessageIdRef.current = streamingMessageId;
      reasoningMessageIdRef.current = null;

      // Truncate messages up to this user message index
      const nextMessages = st.messages.slice(0, index);

      setMessages([
        ...nextMessages,
        {
          id: generateMessageId(),
          content: newText,
          role: "user",
          timestamp: Date.now(),
        },
        {
          content: "",
          id: streamingMessageId,
          role: "assistant",
          timestamp: Date.now(),
        },
      ]);

      setInput("");
      setIsTyping(true);

      if (
        settings.get("enableHapticFeedback", false) &&
        typeof navigator !== "undefined" &&
        navigator.vibrate
      ) {
        navigator.vibrate(50);
      }

      typingTimeoutRef.current = setTimeout(() => {
        addon.log("[ChatView] Typing timeout reached, clearing indicator");
        setIsTyping(false);
        streamingMessageIdRef.current = null;
        reasoningMessageIdRef.current = null;
      }, 60000);

      const client = hermes.client;
      if (!client.getIsConnected()) {
        try {
          await client.connect();
        } catch (err) {
          setError(`Connection failed: ${(err as Error).message}`);
          setIsTyping(false);
          streamingMessageIdRef.current = null;
          return;
        }
      }

      const promptContextItems: PromptContextItem[] = st.contextItems.map(
        (item) => ({
          id: item.id,
          type: item.type,
          text: item.text,
          data: item.data ? JSON.stringify(item.data.toJSON()) : undefined,
          extracted: item.extracted
            ? (item.extracted as unknown as Record<string, unknown>)
            : undefined,
        }),
      );

      try {
        await client.sendPrompt(newText, promptContextItems, {
          allowedTools: st.allowedTools,
        });
      } catch (err) {
        setError(`Send failed: ${(err as Error).message}`);
        setIsTyping(false);
        streamingMessageIdRef.current = null;
      }
    },
    [hermes.client, addon],
  );

  const sendMessage = useCallback(async () => {
    const st = stateRef.current;
    const text = st.input.trim();
    if (!text || st.isTyping) return;

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

      if (slashCmd.command.name === "clear") {
        setMessages([]);
        setContextItems([]);
        hermes.chat.clearMessages();
        hermes.conversations.createConversation();
        return;
      }

      try {
        const result = await slashCmd.command.execute(addon, slashCmd.args);
        if (result) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateMessageId(),
              content: result,
              role: "system",
              timestamp: Date.now(),
            },
          ]);
        } else {
          await sendToHermes(text);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            content: `Error executing /${slashCmd.command.name}: ${(err as Error).message}`,
            role: "system",
            timestamp: Date.now(),
          },
        ]);
      }
      return;
    }

    await sendToHermes(text);
  }, [addon, hermes.chat, hermes.conversations, sendToHermes]);

  // ─── Native DOM event wiring ───
  // Zotero's sandboxed Firefox does not reliably fire React synthetic events
  // (onChange, onClick, onKeyDown). All user interaction goes through native
  // addEventListener via refs.

  // 1. Textarea input → sync to state + slash command detection
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const handler = (e: Event) => {
      const value = (e.target as HTMLTextAreaElement).value;
      setInput(value);

      // Slash command autocomplete
      if (value.startsWith("/") && !value.includes(" ")) {
        const query = value.slice(1).toLowerCase();
        const commands = getSlashCommands();
        const filtered = commands.filter((cmd) =>
          cmd.name.toLowerCase().includes(query),
        );
        setSlashSuggestions(filtered);
        setIsSlashOpen(filtered.length > 0);
        setSlashSelectionIndex(0);
      } else {
        setIsSlashOpen(false);
        setSlashSuggestions([]);
      }
    };
    textarea.addEventListener("input", handler);
    return () => textarea.removeEventListener("input", handler);
  }, []);

  // 2. Sync React state → textarea.value (for clearing on send)
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea && textarea.value !== input) {
      textarea.value = input;
    }
  }, [input]);

  // 3. Send button click → native
  //    When agent is typing the button shows a StopIcon — clicking it cancels the stream.
  useEffect(() => {
    const btn = sendBtnRef.current;
    if (!btn) return;
    const handler = () => {
      if (stateRef.current.isTyping) {
        void hermes.client.cancel();
      } else {
        void sendMessage();
      }
    };
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
  }, [sendMessage, hermes.client]);

  // 4. Textarea Enter key → native + slash command navigation
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        if (isSlashOpen && slashSuggestions.length > 0) {
          e.preventDefault();
          const selected = slashSuggestions[slashSelectionIndex];
          if (selected) {
            setInput(`/${selected.name} `);
            setIsSlashOpen(false);
          }
          return;
        }
        e.preventDefault();
        void sendMessage();
      } else if (e.key === "ArrowDown" && isSlashOpen) {
        e.preventDefault();
        setSlashSelectionIndex((prev) =>
          Math.min(prev + 1, slashSuggestions.length - 1),
        );
      } else if (e.key === "ArrowUp" && isSlashOpen) {
        e.preventDefault();
        setSlashSelectionIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Escape" && isSlashOpen) {
        setIsSlashOpen(false);
      }
    };
    textarea.addEventListener("keydown", handler);
    return () => textarea.removeEventListener("keydown", handler);
  }, [sendMessage, isSlashOpen, slashSuggestions, slashSelectionIndex]);

  // 5. Stream subscription — consume agent responses, reasoning, tools, etc.
  // NOTE: This effect intentionally has minimal deps. The callbacks use refs for
  // mutable state (streamingMessageIdRef, reasoningMessageIdRef) and the
  // client is accessed via hermes.client which is stable after init.
  useEffect(() => {
    const client = hermes.client;
    addon.log("[ChatView] Subscribing to client updates");

    const handleUpdate = (update: ChatSessionUpdate) => {
      // Reset typing timeout on any activity, then restart it for non-terminal events
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      const isTerminal =
        update.type === "stop" ||
        update.type === "usage" ||
        update.type === "session_info" ||
        update.type === "error";
      if (!isTerminal) {
        typingTimeoutRef.current = setTimeout(() => {
          addon.log(
            "[ChatView] Typing timeout reached (no terminal event), clearing indicator",
          );
          setIsTyping(false);
          streamingMessageIdRef.current = null;
          reasoningMessageIdRef.current = null;
        }, 60000);
      }

      console.log(
        "[ChatView] handleUpdate fired:",
        update.type,
        update.type === "message"
          ? "content length=" + (update.content?.length || 0)
          : "",
      );
      if (update.type === "message" && update.content) {
        appendContent(update.content);
        setIsTyping(true);
      } else if (update.type === "stop") {
        flushNow();
        setIsTyping(false);
        streamingMessageIdRef.current = null;
        reasoningMessageIdRef.current = null;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.role === "tool" && m.isRunning) {
              return {
                ...m,
                isRunning: false,
                toolStatus: "complete" as const,
              };
            }
            return m;
          }),
        );
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
          const isRunning =
            update.type !== "tool_complete" &&
            update.toolCall.status === "running";
          const callId = update.toolCall.callId;
          const status =
            update.toolCall.status === "error"
              ? "error"
              : isRunning
                ? "running"
                : "complete";
          setMessages((prev) => {
            const toolIndex = prev.findIndex(
              (m) => m.role === "tool" && m.toolCallId === callId,
            );
            let toolName = update.toolCall!.name;
            if (
              toolIndex >= 0 &&
              (toolName === "other" || toolName === "unknown-tool")
            ) {
              toolName = prev[toolIndex]?.toolName || toolName;
            }
            const resultContent = update.toolCall!.result
              ? `**Result:**\n\`\`\`text\n${update.toolCall!.result}\n\`\`\``
              : "";
            if (toolIndex >= 0) {
              const updated = [...prev];
              updated[toolIndex] = {
                ...updated[toolIndex]!,
                content: resultContent,
                isRunning,
                toolName,
                toolStatus: status,
              };
              return updated;
            }
            const newToolMsg: ChatMessage = {
              content: resultContent,
              id: generateMessageId(),
              isRunning,
              isCollapsed: true,
              role: "tool",
              timestamp: Date.now(),
              toolCallId: callId,
              toolName,
              toolStatus: status,
            };
            const assistantIndex = prev.findIndex(
              (m) => m.id === streamingMessageIdRef.current,
            );
            if (assistantIndex >= 0) {
              const updated = [...prev];
              updated.splice(assistantIndex, 0, newToolMsg);
              return updated;
            }
            return [...prev, newToolMsg];
          });
        }
      } else if (update.type === "terminal_output" && update.terminal) {
        flushNow();
        setMessages((prev) => {
          const index = prev.findIndex(
            (m) =>
              m.role === "terminal" && m.terminalId === update.terminal!.id,
          );
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = {
              ...updated[index]!,
              content: updated[index]!.content + update.terminal!.output,
              isExited:
                (updated[index]!.isExited ?? false) ||
                (update.terminal!.isExited ?? false),
            };
            return updated;
          }
          return [
            {
              content: update.terminal!.output,
              id: generateMessageId(),
              isExited: update.terminal!.isExited ?? false,
              role: "terminal",
              terminalId: update.terminal!.id,
              timestamp: Date.now(),
            },
            ...prev,
          ];
        });
      } else if (update.type === "usage" && update.usage) {
        flushNow();
        setTokenUsage({
          input: update.usage.inputTokens,
          output: update.usage.outputTokens,
          total: update.usage.totalTokens,
        });
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            content: `📊 Tokens: ${update.usage!.inputTokens} in, ${update.usage!.outputTokens} out, ${update.usage!.totalTokens} total`,
            role: "system",
            timestamp: Date.now(),
          },
        ]);
        // usage_update often signals the end of a turn when no stop is sent
        setIsTyping(false);
      } else if (update.type === "session_info") {
        // session_info_update signals the end of a streaming session
        flushNow();
        setIsTyping(false);
        streamingMessageIdRef.current = null;
        reasoningMessageIdRef.current = null;
      } else if (update.type === "error") {
        flushNow();
        const cleaned = stripAnsi(update.content || "").trim();
        if (!cleaned) return;
        setError(cleaned);
        setIsTyping(false);
        streamingMessageIdRef.current = null;
        reasoningMessageIdRef.current = null;
      }
    };

    const handleError = (err: Error) => {
      addon.log("[ChatView] handleError fired:", err.message);
      const cleaned = stripAnsi(err.message).trim();
      if (!cleaned) return;
      setError(cleaned);
      setIsTyping(false);
    };

    const unsubUpdate = client.onUpdate(handleUpdate);
    const unsubError = client.onError(handleError);
    addon.log("[ChatView] Subscribed successfully");

    return () => {
      addon.log("[ChatView] Unsubscribing from client updates");
      unsubUpdate();
      unsubError();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hermes.client]);

  // 6. Click handler on messages list to intercept add-context: links
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handler = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (href && href.startsWith("add-context:")) {
        e.preventDefault();
        const itemIdStr = href.substring("add-context:".length);
        const itemId = parseInt(itemIdStr, 10);
        if (isNaN(itemId)) return;

        try {
          const item = await Zotero.Items.getAsync(itemId);
          if (item) {
            if (item.itemType === "note") {
              const noteText = item.getNote() || "";
              const title = (item as any).getNoteTitle?.() || "Untitled Note";
              setContextItems((prev) => {
                if (prev.some((p) => p.id === `note-${itemId}`)) return prev;
                return [
                  ...prev,
                  {
                    id: `note-${itemId}`,
                    type: "note" as const,
                    text: title,
                    data: item,
                    extracted: {
                      id: item.id,
                      key: item.key,
                      title: title,
                      itemType: "note",
                      creators: [],
                      date: "",
                      abstract: noteText,
                      tags: item.getTags().map((t: any) => t.tag),
                    },
                  },
                ];
              });
            } else {
              const extracted = await hermes.items.extractItemData(item);
              setContextItems((prev) => {
                if (prev.some((p) => p.id === `item-${itemId}`)) return prev;
                return [
                  ...prev,
                  {
                    id: `item-${itemId}`,
                    type: "item" as const,
                    text: item.getDisplayTitle(),
                    data: item,
                    extracted,
                  },
                ];
              });
            }
          }
        } catch (err) {
          setError(`Failed to add item to context: ${(err as Error).message}`);
        }
      } else if (href && href.startsWith("apply-tag:")) {
        e.preventDefault();
        const tag = href.substring("apply-tag:".length);
        const attachedItems = hermes.items.getAttachedItems();
        if (attachedItems.length === 0) {
          setError("No item attached to apply tag to.");
          return;
        }
        const parentItem = attachedItems[0];
        try {
          await hermes.tags.addTags(parentItem.id, [tag]);
          setMessages((prev) => [
            ...prev,
            {
              id: generateMessageId(),
              content: `Applied tag **${tag}** to item **${parentItem.title}**!`,
              role: "system",
              timestamp: Date.now(),
            },
          ]);
        } catch (err) {
          setError(`Failed to apply tag: ${(err as Error).message}`);
        }
      }
    };

    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [hermes.notes, hermes.tags]);

  useEffect(() => {
    const win = Zotero.getMainWindow();
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        win.setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      }
    };
    win.addEventListener("keydown", handleKeyDown);
    return () => win.removeEventListener("keydown", handleKeyDown);
  }, []);

  const attachSelectedItems = useCallback(async () => {
    const items = hermes.items.getSelectedItems();
    if (items.length === 0) {
      setError("No items selected in Zotero library.");
      return;
    }
    // extractItemData is async (awaits getBestAttachment) — resolve all before
    // calling setContextItems, since state updater functions must be synchronous.
    const resolved = await Promise.all(
      items.map(async (item) => ({
        id: `item-${item.id}`,
        type: "item" as const,
        text: item.getDisplayTitle(),
        data: item,
        extracted: await hermes.items.extractItemData(item),
      })),
    );
    setContextItems((prev) => {
      const newItems = resolved.filter(
        (item) => !prev.some((p) => p.id === item.id),
      );
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

  const performSearch = useCallback(
    (query: string): void => {
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
    },
    [messages],
  );

  const jumpToMatch = useCallback(
    (direction: "next" | "prev"): void => {
      if (searchMatches.length === 0) return;
      const newIndex =
        direction === "next"
          ? (currentMatchIndex + 1) % searchMatches.length
          : (currentMatchIndex - 1 + searchMatches.length) %
            searchMatches.length;
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
    <div
      className="hermes-chat-view"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--hermes-bg, #fff)",
        color: "var(--hermes-text, #333)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "14px",
      }}
    >
      {/* Header with SVG icons (matching Obsidian plugin) */}
      <div
        className="hermes-chat-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid var(--hermes-border, #e0e0e0)",
          backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
          minHeight: "40px",
        }}
      >
        <div
          className="hermes-chat-header-left"
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <span
            className="hermes-chat-agent-name"
            style={{ fontWeight: 600, fontSize: "0.95em" }}
          >
            {settings.get("chatAgentName", "Hermes")}
          </span>
        </div>
        <div
          className="hermes-chat-header-right"
          style={{ display: "flex", gap: "4px", alignItems: "center" }}
        >
          <button
            onClick={() => {
              setIsSearchOpen((prev) => !prev);
              if (!isSearchOpen)
                setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
            className="hermes-icon-btn"
            title="Search Messages (Ctrl+F)"
          >
            <SearchIcon />
          </button>
          <button
            onClick={() => {
              loadConversationList();
              setIsConversationListOpen((prev) => !prev);
            }}
            className="hermes-icon-btn"
            title="Previous Conversations"
          >
            <MenuIcon />
          </button>
          <button
            onClick={attachSelectedItems}
            className="hermes-icon-btn"
            title="Attach Selected Items"
          >
            <AttachIcon />
          </button>
          <button
            onClick={newChat}
            className="hermes-icon-btn"
            title="New Chat"
          >
            <PlusIcon />
          </button>
          <button
            onClick={() => setIsSessionSettingsOpen((prev) => !prev)}
            className="hermes-icon-btn"
            title="Session Settings"
          >
            <SettingsIcon />
          </button>
          <button
            onClick={() => setIsExportOpen((prev) => !prev)}
            className="hermes-icon-btn"
            title="Export Conversation"
            style={{ fontSize: "1.1em", padding: 0 }}
          >
            📥
          </button>
        </div>
      </div>

      {/* Export Options Dropdown */}
      {isExportOpen && (
        <div
          className="hermes-export-dropdown"
          style={{
            position: "absolute",
            top: "45px",
            right: "12px",
            backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
            border: "1px solid var(--hermes-border, #e0e0e0)",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            padding: "4px 0",
            minWidth: "120px",
          }}
        >
          <button
            onClick={() => {
              exportToHtml();
              setIsExportOpen(false);
            }}
            style={{
              padding: "6px 12px",
              border: "none",
              background: "none",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "0.85em",
              color: "inherit",
            }}
          >
            HTML format
          </button>
          <button
            onClick={() => {
              exportToJson();
              setIsExportOpen(false);
            }}
            style={{
              padding: "6px 12px",
              border: "none",
              background: "none",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "0.85em",
              color: "inherit",
            }}
          >
            JSON format
          </button>
          <button
            onClick={() => {
              exportToMarkdown();
              setIsExportOpen(false);
            }}
            style={{
              padding: "6px 12px",
              border: "none",
              background: "none",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "0.85em",
              color: "inherit",
            }}
          >
            Markdown format
          </button>
        </div>
      )}

      {/* Conversation List */}
      {isConversationListOpen && (
        <div className="hermes-conversation-list">
          <div className="hermes-conversation-list-header">
            <span className="hermes-conversation-list-title">
              Previous Conversations
            </span>
            <button
              onClick={() => setIsConversationListOpen(false)}
              className="hermes-small-btn"
            >
              <CloseIcon />
            </button>
          </div>
          {conversations.length === 0 ? (
            <div className="hermes-conversation-empty">
              No saved conversations
            </div>
          ) : (
            <ul style={{ margin: 0, padding: "0 0 0 1em" }}>
              {conversations.slice(0, 10).map((conv) => (
                <li key={conv.id} className="hermes-conversation-item">
                  <button
                    onClick={() => handleLoadConversation(conv.id)}
                    className="hermes-conversation-item-btn"
                  >
                    {conv.title}
                  </button>
                  <button
                    onClick={() => handleDeleteConversation(conv.id)}
                    className="hermes-small-btn"
                    style={{ color: "red", padding: "0 4px" }}
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
        <div className="hermes-search-bar">
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
            className="hermes-search-input"
          />
          {searchMatches.length > 0 && (
            <span className="hermes-search-count">
              {currentMatchIndex + 1} / {searchMatches.length}
            </span>
          )}
          <button
            onClick={() => jumpToMatch("prev")}
            className="hermes-small-btn"
            title="Previous"
          >
            ↑
          </button>
          <button
            onClick={() => jumpToMatch("next")}
            className="hermes-small-btn"
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
            className="hermes-small-btn"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Session Settings */}
      {isSessionSettingsOpen && (
        <div className="hermes-session-settings">
          <div className="hermes-session-settings-header">
            <span className="hermes-session-settings-title">
              Session Settings
            </span>
            <button
              onClick={() => setIsSessionSettingsOpen(false)}
              className="hermes-small-btn"
            >
              <CloseIcon />
            </button>
          </div>
          <p className="hermes-session-settings-desc">
            Configure tool permissions for this conversation. Disabled tools
            will not be available to the agent.
          </p>
          <div className="hermes-session-settings-actions">
            <button
              onClick={() => setAllowedTools(null)}
              className="hermes-session-btn-secondary"
            >
              Allow All
            </button>
            <button
              onClick={() => setAllowedTools([])}
              className="hermes-session-btn-secondary"
            >
              Block All
            </button>
          </div>
          <div>
            {["read_file", "write_file", "terminal"].map((tool) => (
              <label key={tool} className="hermes-session-tool-toggle">
                <input
                  type="checkbox"
                  checked={allowedTools === null || allowedTools.includes(tool)}
                  onChange={(e) => {
                    const current = allowedTools ?? [
                      "read_file",
                      "write_file",
                      "terminal",
                    ];
                    if (e.target.checked) {
                      setAllowedTools([...current, tool]);
                    } else {
                      setAllowedTools(current.filter((t) => t !== tool));
                    }
                  }}
                />
                {tool === "read_file" && "Read Files"}
                {tool === "write_file" && "Write Files"}
                {tool === "terminal" && "Terminal Commands"}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Onboarding Panel */}
      {showOnboarding && messages.length === 0 && (
        <div className="hermes-onboarding">
          <div className="hermes-onboarding-header">
            <span>Welcome to Hermes</span>
            <button
              onClick={() => {
                setShowOnboarding(false);
                settings.set("hasSeenOnboarding", true);
              }}
              className="hermes-small-btn"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="hermes-onboarding-content">
            <p>
              Hermes is an AI assistant that helps you work with your Zotero
              library.
            </p>
            <ul>
              <li>
                <strong>Attach items</strong> — Select Zotero items and click
                the paperclip icon to provide context
              </li>
              <li>
                <strong>Ask questions</strong> — Chat with Hermes about your
                research, annotations, and metadata
              </li>
              <li>
                <strong>Slash commands</strong> — Type <code>/help</code> to see
                available commands
              </li>
              <li>
                <strong>Session settings</strong> — Control which tools the
                agent can use
              </li>
            </ul>
            <p>
              Your conversations are saved locally and can be searched or
              exported.
            </p>
          </div>
          <div className="hermes-onboarding-security">
            🔒 Hermes runs locally. Your data stays on your machine.
          </div>
        </div>
      )}

      {/* Messages */}
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
            <ChatMessageItem
              key={msg.id}
              message={msg}
              addon={addon}
              onEditMessage={
                msg.role === "user"
                  ? (newText) => resendFromIndex(idx, newText)
                  : undefined
              }
            />
          );
        })}
        {isTyping && (
          <TypingIndicator
            agentName={settings.get("chatAgentName", "Hermes")}
          />
        )}
        {error && (
          <div className="hermes-error-bar">
            <span>⚠️</span>
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={() => setError(null)}
              className="hermes-error-bar-close"
            >
              ✕
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Context items chips */}
      {contextItems.length > 0 && (
        <div
          className="hermes-context-bar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            borderTop: "1px solid var(--hermes-border, #e0e0e0)",
            backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
          }}
        >
          <div className="hermes-context-chips">
            {contextItems.map((item) => (
              <div key={item.id} className="hermes-context-chip">
                <span style={{ fontSize: "0.8em" }}>{item.text}</span>
                <button
                  onClick={() =>
                    setContextItems((prev) =>
                      prev.filter((c) => c.id !== item.id),
                    )
                  }
                  className="hermes-context-chip-remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button onClick={clearContext} className="hermes-context-clear">
            Clear
          </button>
        </div>
      )}

      {/* Token Dashboard */}
      {tokenUsage && (
        <div
          className="hermes-token-dashboard"
          style={{
            fontSize: "0.75em",
            color: "var(--hermes-text-muted, #666)",
            padding: "6px 12px",
            borderTop: "1px solid var(--hermes-border, #e0e0e0)",
            backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
            textAlign: "right",
          }}
        >
          📊 Tokens: <strong>{tokenUsage.input}</strong> in,{" "}
          <strong>{tokenUsage.output}</strong> out (Total: {tokenUsage.total})
        </div>
      )}

      {/* Input area */}
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
                onClick={() => {
                  setInput(`/${cmd.name} `);
                  setIsSlashOpen(false);
                }}
              >
                <span className="hermes-slash-item-name">/{cmd.name}</span>
                <span className="hermes-slash-item-desc">
                  {cmd.description}
                </span>
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
            disabled={!input.trim() || isTyping}
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
              opacity: !input.trim() || isTyping ? 0.5 : 1,
            }}
          >
            {isTyping ? <StopIcon /> : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Render a single chat message matching Obsidian plugin layout.
 */
const ChatMessageItem = memo(function ChatMessageItem({
  message,
  addon,
  onEditMessage,
}: {
  message: ChatMessage;
  addon: Addon;
  onEditMessage?: (newContent: string) => void;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

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
      const htmlParts = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          if (!inList) {
            inList = true;
            htmlParts.push("<ul>");
          }
          htmlParts.push(
            `<li>${trimmed.substring(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`,
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
    const statusIcon = isError ? "❌ " : <HelixSpinner isRunning={isRunning} />;
    roleLabel = (
      <>
        {statusIcon}Tool: {message.toolName}
      </>
    );
  }

  // Collapsible reasoning and tool messages
  if (message.role === "reasoning" || message.role === "tool") {
    const [isExpanded, setIsExpanded] = useState(!message.isCollapsed);
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
            🛑 Abort
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

// --- Inline Styles (Obsidian-aligned) ---

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
  padding: "8px 12px",
  borderBottom: "1px solid var(--hermes-border, #e0e0e0)",
  backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
  minHeight: "40px",
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  minWidth: 0,
};

// ─── User message bubble ───
const userMsgStyle: React.CSSProperties = {
  borderRadius: "8px",
  backgroundColor: "var(--hermes-accent, #4a90d9)",
  color: "var(--hermes-accent-text, white)",
  alignSelf: "flex-end",
  maxWidth: "85%",
  minWidth: 0,
  overflowWrap: "break-word",
};

// ─── Assistant message bubble ───
const assistantMsgStyle: React.CSSProperties = {
  borderRadius: "8px",
  backgroundColor: "var(--hermes-bg-secondary, #f5f5f5)",
  color: "inherit",
  alignSelf: "flex-start",
  maxWidth: "85%",
  minWidth: 0,
  overflowWrap: "break-word",
};

const assistantMessageBubbleStyle: React.CSSProperties = {
  ...assistantMsgStyle,
};

// ─── Header row shared across all messages ───
const msgHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  fontSize: "0.8em",
};

const msgRoleStyle: React.CSSProperties = {
  fontWeight: 600,
  opacity: 0.8,
};

const msgMetaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
};

const msgActionBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px",
  display: "inline-flex",
  alignItems: "center",
  opacity: 0.4,
  color: "inherit",
};

const msgContentPadStyle: React.CSSProperties = {
  padding: "0 12px 10px",
};

// ─── Collapsible message (reasoning, tool) ───
const collapsibleMsgStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  maxWidth: "85%",
  minWidth: 0,
  borderRadius: "8px",
  border: "1px solid var(--hermes-border, #e0e0e0)",
};

// ─── Terminal message ───
const terminalMsgStyle: React.CSSProperties = {
  alignSelf: "stretch",
  borderRadius: "8px",
  backgroundColor: "#1e1e2e",
  color: "#cdd6f4",
  fontFamily: "monospace",
  fontSize: "0.85em",
};

const abortBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  border: "none",
  cursor: "pointer",
  color: "#cdd6f4",
  padding: "4px 12px",
  fontSize: "0.8em",
};

// ─── Error bar ───
const errorBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 12px",
  backgroundColor: "var(--hermes-error-bg, #fff0f0)",
  color: "var(--hermes-error-text, #c00)",
  borderRadius: "8px",
  fontSize: "0.85em",
  margin: "4px 0",
};

// ─── Context bar ───
const contextBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 12px",
  borderTop: "1px solid var(--hermes-border, #e0e0e0)",
  backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
};

const contextChipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
  padding: "2px 8px",
  borderRadius: "12px",
  backgroundColor: "var(--hermes-bg-tertiary, #eee)",
  fontSize: "0.8em",
};

const chipRemoveBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "0 2px",
  fontSize: "0.8em",
  opacity: 0.5,
  color: "inherit",
};

// ─── Input area ───
const inputAreaStyle: React.CSSProperties = {
  padding: "8px",
  borderTop: "1px solid var(--hermes-border, #e0e0e0)",
  backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
};

const textareaStyle: React.CSSProperties = {
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
};

const sendBtnStyle: React.CSSProperties = {
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
};

// ─── Icon button (header toolbar) ───
const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "4px",
  color: "inherit",
  opacity: 0.7,
};

const smallBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px 6px",
  display: "inline-flex",
  alignItems: "center",
  color: "inherit",
  opacity: 0.6,
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
      if (
        htmlClass.includes("dark") ||
        htmlClass.includes("theme-dark") ||
        htmlAttr.includes("dark")
      ) {
        isDark = true;
        addonInstance.log(
          "Hermes theme: detected dark via document class/attr",
        );
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
      addonInstance.log(
        "Hermes theme: style tag appended to " + parent.nodeName,
      );
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
        addonInstance.log(
          "Hermes theme: CSSOM insertRule succeeded, rules=" +
            sheet.cssRules.length,
        );
      } else {
        addonInstance.log(
          "Hermes theme: WARNING — sheet or insertRule not available",
        );
      }
    } else {
      addonInstance.log(
        "Hermes theme: WARNING — no parent element found for style tag",
      );
    }
  }

  // Load external CSS file (hermes-chat.css) via chrome URL and inject
  try {
    const cssUrl = `chrome://hermes/content/hermes-chat.css`;
    addonInstance.log(`Hermes theme: loading CSS from ${cssUrl}`);
    const xhr = new XMLHttpRequest();
    xhr.open("GET", cssUrl, true);
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4 && xhr.status === 200) {
        const cssText = xhr.responseText;
        if (doc && cssText) {
          const existingCss = doc.getElementById("hermes-chat-css");
          if (existingCss) existingCss.remove();
          const cssStyleEl = doc.createElement("style");
          cssStyleEl.setAttribute("id", "hermes-chat-css");
          cssStyleEl.setAttribute("type", "text/css");
          const cssParent = doc.documentElement || doc.head || doc.body;
          if (cssParent) {
            cssParent.appendChild(cssStyleEl);
            // textContent works for <style> in Firefox — much more reliable than insertRule
            cssStyleEl.textContent = cssText;
            addonInstance.log(
              `Hermes theme: injected hermes-chat.css (${cssText.length} chars)`,
            );
          }
        }
      } else if (xhr.readyState === 4) {
        addonInstance.log(
          `Hermes theme: WARNING — failed to load CSS: ${xhr.status}`,
        );
      }
    };
    xhr.send();
  } catch (e) {
    addonInstance.log(`Hermes theme: CSS load error: ${(e as Error).message}`);
  }

  // Listen for OS theme changes and update dynamically
  try {
    const mq = win?.matchMedia?.("(prefers-color-scheme: dark)");
    if (mq) {
      const onThemeChange = (e: MediaQueryListEvent) => {
        addonInstance.log(
          `Hermes theme: OS theme changed to ${e.matches ? "dark" : "light"}`,
        );
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
        container.style.setProperty(
          "--hermes-bg-secondary",
          newTheme.bgSecondary,
        );
        container.style.setProperty(
          "--hermes-bg-tertiary",
          newTheme.bgTertiary,
        );
        container.style.setProperty("--hermes-input-bg", newTheme.inputBg);
        container.style.backgroundColor = newTheme.bg;
        container.style.color = newTheme.text;
        container.style.colorScheme = newIsDark ? "dark" : "light";
      };
      mq.addEventListener("change", onThemeChange);
    }
  } catch {
    // ignore
  }

  addonInstance.log(
    `Hermes theme: container innerHTML before render = "${(container.innerHTML as string).slice(0, 80)}..."`,
  );

  let root: ReturnType<typeof createRoot> | null = null;
  try {
    root = createRoot(container);
    addonInstance.log("Hermes theme: createRoot succeeded");
  } catch (err) {
    addonInstance.log(
      `Hermes theme: createRoot FAILED: ${(err as Error).message}`,
    );
    container.innerHTML = `<div style="padding:16px;color:red">createRoot error: ${(err as Error).message}</div>`;
    return () => {};
  }

  try {
    root.render(<HermesChatViewComponent addon={addonInstance} />);
    addonInstance.log("Hermes theme: root.render() called successfully");
  } catch (err) {
    addonInstance.log(
      `Hermes theme: root.render() FAILED: ${(err as Error).message}`,
    );
    container.innerHTML = `<div style="padding:16px;color:red">Render error: ${(err as Error).message}</div>`;
  }

  return () => {
    addonInstance.log("Hermes theme: unmounting React root");
    root?.unmount();
  };
}
