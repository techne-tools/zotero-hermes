// ─── ChatClient Interface ───
// Mirrors obsidian-hermes/src/ChatClient.ts

export interface ChatClient {
  cancel(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): void;
  getIsConnected(): boolean;
  isReady(): boolean;
  onAvailableCommands(
    callback: (commands: { description: string; name: string }[]) => void,
  ): () => void;
  onError(callback: (error: Error) => void): () => void;
  onUpdate(callback: (update: ChatSessionUpdate) => void): () => void;
  sendPrompt(
    text: string,
    contextItems?: PromptContextItem[],
    options?: { allowedTools?: string[] | null },
  ): Promise<void>;
}

// ─── ChatSessionUpdate ───
// Mirrors obsidian-hermes/src/ChatClient.ts

export interface ChatSessionUpdate {
  type:
    | "message"
    | "reasoning"
    | "stop"
    | "tool_start"
    | "tool_progress"
    | "tool_complete"
    | "error"
    | "available_commands"
    | "terminal_output"
    | "usage"
    | "session_info";
  content?: string;
  reasoning?: string;
  stopReason?: string;
  toolCall?: {
    callId: string;
    name: string;
    status: "complete" | "error" | "running";
    result?: string;
  };
  terminal?: {
    id: string;
    output: string;
    isExited?: boolean;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  availableCommands?: Array<{ description: string; name: string }>;
}

// ─── PromptContextItem ───
// Mirrors obsidian-hermes/src/AcpClient.ts

export interface PromptContextItem {
  id: string;
  type: "folder" | "image" | "item" | "note" | "pdf" | "selection";
  text: string;
  data?: string;
  mimeType?: string;
  extracted?: Record<string, unknown>;
}

// ─── PendingFileChange ───
// Mirrors obsidian-hermes/src/FileChangeManager.ts (minimal subset for Zotero)

export interface PendingFileChange {
  action: "create" | "delete" | "modify";
  id: string;
  newContent: string | null;
  path: string;
  status: "approved" | "pending" | "rejected";
  timestamp: number;
}
