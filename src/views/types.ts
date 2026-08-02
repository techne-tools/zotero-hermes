import type { AttachedItem } from "../modules/hermes/ItemManager";

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
  extracted?: AttachedItem | null;
}
