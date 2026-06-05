import { config } from "../../../package.json";
import pkg from "../../../package.json";

import type { ChatClient, ChatSessionUpdate, PromptContextItem } from "./types";
import type { ChatMessage } from "../../views/HermesChatView";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

const PROTOCOL_VERSION = 1;

const HERMES_BINARY_CANDIDATES = [
  "hermes",
  "hermes-cli",
];

const HERMES_PATH_CANDIDATES = [
  "/usr/local/bin",
  "/usr/bin",
  "/opt/homebrew/bin",
  "/opt/local/bin",
  "~/.local/bin",
  "~/bin",
];

/**
 * Hermes Agent Client for ACP (Agent Client Protocol) connection.
 * Spawns `hermes acp` as a subprocess and communicates via JSON-RPC over stdio.
 * Auto-discovers the binary across $PATH and common install locations.
 */
export class HermesClient implements ChatClient {
  private childProcess: any | null = null;
  private _isConnected = false;
  private readonly addon: any;
  private sessionId: string | null = null;
  private messageIdCounter = 0;
  private pendingResponses = new Map<string, (value: JsonRpcResponse) => void>();
  private pendingErrors = new Map<string, (error: Error) => void>();
  private stdoutBuffer = "";
  private onUpdateCallback: ((update: ChatSessionUpdate) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onToolUpdateCallback:
    | ((
        toolCallId: string,
        title: string,
        status: string,
        payload?: string,
      ) => void)
    | null = null;
  private onAvailableCommandsCallback:
    | ((commands: Array<{ description: string; name: string }>) => void)
    | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private reconnectTimeout: number | null = null;
  private currentAllowedTools: string[] | null = null;

  constructor(addon: any) {
    this.addon = addon;
  }

  public isReady(): boolean {
    const hermesPath = Zotero.Prefs.get(
      `${config.prefsPrefix}.binaryPath`,
      true,
    ) as string;
    return Boolean(hermesPath || this.findHermesPath());
  }

  public getIsConnected(): boolean {
    return this._isConnected;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Connect to Hermes agent via ACP protocol.
   * Auto-discovers the binary if no explicit path is configured.
   */
  public async connect(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    try {
      const hermesPath = this.resolveHermesPath();

      if (!hermesPath) {
        throw new Error(
          "Hermes binary not found. Install Hermes or set the path in preferences.",
        );
      }

      this.addon.log(`Starting Hermes ACP from: ${hermesPath}`);

      this.addon.log(`Spawning Hermes ACP via zsh with manual .zshrc sourcing from: ${hermesPath}`);

      // Spawn hermes acp subprocess using Firefox Subprocess.sys.mjs via zsh.
      // We manually construct and export the PATH variable to include Homebrew bin paths, ensuring npx and Node are found instantly for MCP servers
      // without sourcing ~/.zshrc which pollutes stdout with interactive terminal greetings/banners.
      const envService = (Components.classes as any)["@mozilla.org/process/environment;1"]
        .getService((Components.interfaces as any).nsIEnvironment);
      const homeDir = envService.get("HOME") || "/Users/chris";
      const customPath = `/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${homeDir}/.local/bin`;

      const { Subprocess } = ChromeUtils.importESModule(
        "resource://gre/modules/Subprocess.sys.mjs",
      );
      this.childProcess = await Subprocess.call({
        command: "/bin/zsh",
        arguments: ["-c", `export PATH="${customPath}:$PATH" && "${hermesPath}" acp`],
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        environment: { PYTHONUNBUFFERED: "1" },
        environmentAppend: true,
      });

      this.setupStdioHandlers();

      // Wait for process startup
      await Zotero.Promise.delay(300);

      // Initialize ACP handshake
      await this.initializeConnection();

      // Create a new session
      await this.createSession();

      this._isConnected = true;
      this.reconnectAttempts = 0;

      this.addon.log("Hermes ACP connected", { sessionId: this.sessionId });
    } catch (error) {
      this.addon.log("ACP connection failed", error);
      this.disconnect();
      throw error;
    }
  }

  /**
   * Disconnect and clean up the ACP connection.
   */
  public disconnect(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.childProcess) {
      try {
        this.childProcess.kill();
      } catch {
        // Process may already be dead
      }
      this.childProcess = null;
    }

    this._isConnected = false;
    this.sessionId = null;
    this.stdoutBuffer = "";

    // Reject all pending promises
    for (const [, reject] of this.pendingErrors) {
      reject(new Error("Connection closed"));
    }
    this.pendingResponses.clear();
    this.pendingErrors.clear();
  }

  /**
   * Send a user message to Hermes and stream the response.
   */
  public async sendPrompt(
    text: string,
    contextItems: PromptContextItem[] = [],
    options?: { allowedTools?: string[] | null },
  ): Promise<void> {
    this.addon.log("[HermesClient] sendPrompt called");
    if (!this._isConnected || !this.sessionId) {
      this.addon.log("[HermesClient] Not connected, calling connect()...");
      await this.connect();
    }

    this.currentAllowedTools = options?.allowedTools ?? null;

    const messageId = this.generateMessageId();
    const promptBlocks: Array<{ type: string; text: string }> = [];

    // System instruction: use fs tools to read Zotero SQLite directly
    const zoteroDataDir = (Zotero as any).getZoteroDirectory?.()?.path || (Zotero as any).DataDirectory?.dir || "/Users/chris/Zotero";
    const zoteroProfileDir = Zotero.getProfileDirectory?.()?.path || "";
    const zoteroStorageDir = `${zoteroDataDir}/storage`;
    const zoteroDbPath = `${zoteroDataDir}/zotero.sqlite`;

    const systemInstruction = `You are the Hermes Agent for Zotero. Your primary focus is the user's Zotero research library.

ZOTERO LIBRARY ACCESS:
- Zotero data directory: ${zoteroDataDir}
- Zotero database: ${zoteroDbPath} (NOTE: This SQLite database is locked while Zotero is running. You CANNOT read it directly via fs tools.)
- Zotero storage (attachments): ${zoteroStorageDir}
- Zotero profile directory: ${zoteroProfileDir}

CRITICAL CONSTRAINTS:
1. The Zotero SQLite database at ${zoteroDbPath} is locked while Zotero is running. You cannot read it with fs tools.
2. MCP tools are NOT available. Do not attempt to use any MCP server or MCP tools.
3. The ONLY way to access Zotero library data is through the context items the user attaches to the conversation.
4. If the user asks about items not in context, ask them to attach those Zotero items to the conversation.

HOW TO HELP THE USER:
- The metadata for attached Zotero items is ALREADY provided in the conversation context (title, authors, abstract, tags, date, DOI, URL, item type, storage path).
- When the user asks about an attached item, ANSWER DIRECTLY using the provided metadata. Do NOT search online, do NOT try to read the SQLite database, do NOT try to access the filesystem.
- If the user asks about items not in context, tell them: "Please attach the relevant Zotero items to this conversation so I can access their metadata."
- For PDF attachments, the storage path is ${zoteroStorageDir}/<item_key>/ — but you can only access files the user explicitly shares.

OBSIDIAN AWARENESS (secondary):
- If the Obsidian Hermes plugin is also installed, you may be aware of the user's vault path.
- Only search Obsidian as a FALLBACK when the Zotero library does not contain the requested information.
- Do not assume Obsidian content is more relevant than Zotero for research queries.

Always cite Zotero items by title and author when providing answers.`;
    promptBlocks.push({ type: "text", text: systemInstruction });

    // Add context items with Zotero library location info
    for (const item of contextItems) {
      let contextText = `[${item.type}]: ${item.text}`;
      if (item.type === "item" && item.data) {
        try {
          const itemData = JSON.parse(item.data) as Record<string, unknown>;
          const itemKey = itemData.key as string | undefined;
          const itemId = itemData.id as number | undefined;
          if (itemKey) {
            contextText += `\nZotero item key: ${itemKey}`;
            contextText += `\nZotero item ID: ${itemId || "unknown"}`;
          }
        } catch {
          // ignore JSON parse errors
        }
      }
      // Use extracted attachment info if available (resolves correct storage folder)
      if (item.type === "item" && (item as any).extracted) {
        const extracted = (item as any).extracted as Record<string, unknown>;
        // Pass full metadata so the agent can answer without hallucinating
        if (extracted.title) {
          contextText += `\nTitle: ${extracted.title}`;
        }
        if (extracted.creators && Array.isArray(extracted.creators) && extracted.creators.length > 0) {
          contextText += `\nAuthors: ${(extracted.creators as string[]).join(", ")}`;
        }
        if (extracted.date) {
          contextText += `\nDate: ${extracted.date}`;
        }
        if (extracted.abstract) {
          contextText += `\nAbstract: ${extracted.abstract}`;
        }
        if (extracted.tags && Array.isArray(extracted.tags) && extracted.tags.length > 0) {
          contextText += `\nTags: ${(extracted.tags as string[]).join(", ")}`;
        }
        if (extracted.doi) {
          contextText += `\nDOI: ${extracted.doi}`;
        }
        if (extracted.url) {
          contextText += `\nURL: ${extracted.url}`;
        }
        if (extracted.itemType) {
          contextText += `\nItem type: ${extracted.itemType}`;
        }
        if (extracted.attachmentKey) {
          contextText += `\nZotero attachment key: ${extracted.attachmentKey}`;
          contextText += `\nZotero storage path: ${zoteroStorageDir}/${extracted.attachmentKey}/`;
        }
        if (extracted.storagePath) {
          contextText += `\nZotero file path: ${extracted.storagePath}`;
        }
      }
      promptBlocks.push({ type: "text", text: contextText });
    }

    promptBlocks.push({ type: "text", text });

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: messageId,
      method: "session/prompt",
      params: {
        sessionId: this.sessionId,
        prompt: promptBlocks,
      },
    };

    this.addon.log("[HermesClient] Writing to stdin:", JSON.stringify(request).slice(0, 200));
    this.writeToStdin(JSON.stringify(request) + "\n");
    this.addon.log("[HermesClient] Request sent");
  }

  /**
   * Cancel the current prompt turn.
   */
  public async cancel(): Promise<void> {
    if (!this.sessionId) return;

    const messageId = this.generateMessageId();
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: messageId,
      method: "session/cancel",
      params: { sessionId: this.sessionId },
    };

    this.writeToStdin(JSON.stringify(request) + "\n");
  }

  public onUpdate(callback: (update: ChatSessionUpdate) => void): () => void {
    this.onUpdateCallback = callback;
    return () => {
      this.onUpdateCallback = null;
    };
  }

  public onError(callback: (error: Error) => void): () => void {
    this.onErrorCallback = callback;
    return () => {
      this.onErrorCallback = null;
    };
  }

  public onAvailableCommands(
    callback: (commands: Array<{ description: string; name: string }>) => void,
  ): () => void {
    this.onAvailableCommandsCallback = callback;
    return () => {
      this.onAvailableCommandsCallback = null;
    };
  }

  public onToolUpdate(
    callback: (
      toolCallId: string,
      title: string,
      status: string,
      payload?: string,
    ) => void,
  ): () => void {
    this.onToolUpdateCallback = callback;
    return () => {
      this.onToolUpdateCallback = null;
    };
  }

  // --- Private helpers ---

  /**
   * Resolve the Hermes binary path from preferences or auto-discovery.
   */
  private resolveHermesPath(): string | null {
    const configuredPath = Zotero.Prefs.get(
      `${config.prefsPrefix}.binaryPath`,
      true,
    ) as string;

    if (configuredPath) {
      return configuredPath;
    }

    return this.findHermesPath();
  }

  /**
   * Auto-discover the Hermes binary across $PATH and common install locations.
   */
  private findHermesPath(): string | null {
    // 1. Try $PATH via `which`-like search using nsIEnvironment
    const env = (Components.classes as any)["@mozilla.org/process/environment;1"]
      .getService((Components.interfaces as any).nsIEnvironment);
    const pathEnv = env.get("PATH") || "";
    const pathDirs = pathEnv.split(":");

    for (const dir of pathDirs) {
      for (const bin of HERMES_BINARY_CANDIDATES) {
        const candidate = `${dir}/${bin}`;
        if (this.fileExists(candidate)) {
          return candidate;
        }
      }
    }

    // 2. Try common install locations
    const homeDir = env.get("HOME") || "";
    for (const dir of HERMES_PATH_CANDIDATES) {
      const resolvedDir = dir.startsWith("~")
        ? `${homeDir}${dir.slice(1)}`
        : dir;
      for (const bin of HERMES_BINARY_CANDIDATES) {
        const candidate = `${resolvedDir}/${bin}`;
        if (this.fileExists(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Check if a file exists and is executable.
   */
  private fileExists(path: string): boolean {
    try {
      const file = (Components.classes as any)["@mozilla.org/file/local;1"]
        .createInstance((Components.interfaces as any).nsIFile);
      file.initWithPath(path);
      return file.exists() && file.isExecutable();
    } catch {
      return false;
    }
  }

  /**
   * Set up stdout/stderr handlers for NDJSON communication.
   */
  private setupStdioHandlers(): void {
    if (!this.childProcess) return;

    const stdoutDecoder = new TextDecoder();
    this.childProcess.stdout.onInput = (data: ArrayBuffer) => {
      try {
        const chunk = stdoutDecoder.decode(data);
        if (chunk) {
          this.stdoutBuffer += chunk;
          this.processStdoutBuffer();
        }
      } catch (e) {
        this.addon.log("Error decoding stdout chunk:", e);
      }
    };

    const stderrDecoder = new TextDecoder();
    this.childProcess.stderr.onInput = (data: ArrayBuffer) => {
      try {
        const chunk = stderrDecoder.decode(data);
        const line = chunk.trim();
        if (line) {
          this.addon.log(`Hermes stderr: ${line}`);
        }
      } catch (e) {
        this.addon.log("Error decoding stderr chunk:", e);
      }
    };

    // 3. Wait for process exit
    this.childProcess.wait().then(({ exitCode }: { exitCode: number }) => {
      this.addon.log(`Hermes process exited with code ${exitCode}`);
      this.handleDisconnect();
    }).catch((e: any) => {
      this.addon.log("Error waiting for Hermes exit:", e);
    });
  }

  /**
   * Process buffered stdout data, extracting complete NDJSON lines.
   */
  private processStdoutBuffer(): void {
    let lineEnd = this.stdoutBuffer.indexOf("\n");
    let processedCount = 0;
    while (lineEnd >= 0) {
      const line = this.stdoutBuffer.slice(0, lineEnd).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(lineEnd + 1);

      if (line) {
        try {
          const message = JSON.parse(line) as
            | JsonRpcResponse
            | JsonRpcNotification;
          this.handleMessage(message);
          processedCount++;
        } catch (e) {
          this.addon.log("Failed to parse NDJSON line", line);
        }
      }

      lineEnd = this.stdoutBuffer.indexOf("\n");
    }
    if (processedCount > 0) {
      this.addon.log(`[HermesClient] processStdoutBuffer: processed ${processedCount} lines`);
    }
  }

  /**
   * Handle an incoming JSON-RPC message (response or notification).
   */
  private handleMessage(
    message: JsonRpcResponse | JsonRpcNotification,
  ): void {
    // Response with id -> resolve pending promise
    if ("id" in message && message.id !== undefined) {
      const resolve = this.pendingResponses.get(message.id);
      const reject = this.pendingErrors.get(message.id);
      if (resolve) {
        resolve(message as JsonRpcResponse);
        this.pendingResponses.delete(message.id);
        this.pendingErrors.delete(message.id);
      }
      return;
    }

    // Notification (no id)
    if ("method" in message) {
      this.handleNotification(message as JsonRpcNotification);
    }
  }

  /**
   * Handle ACP notifications (streaming updates, tool calls, etc.).
   *
   * ACTUAL HERMES ACP FORMAT:
   * All notifications use method "session/update" with params:
   *   {
   *     sessionId: string,
   *     update: {
   *       sessionUpdate: "agent_message_chunk" | "agent_thought_chunk" | "usage_update" | "available_commands" | ...,
   *       content?: { text: string, type: "text" },
   *       // other fields depending on sessionUpdate type
   *     }
   *   }
   */
  private handleNotification(notification: JsonRpcNotification): void {
    const method = notification.method;
    const params = notification.params || {};

    // Hermes ACP uses a unified "session/update" method for all streaming notifications
    if (method === "session/update") {
      const update = params.update as
        | {
            sessionUpdate?: string;
            content?: { text?: string; type?: string };
            reasoning?: string;
            toolCall?: {
              callId: string;
              name: string;
              status: "complete" | "error" | "running";
              result?: string;
            };
            usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
            availableCommands?: Array<{ description: string; name: string }>;
            terminal?: { id: string; output: string; isExited?: boolean };
            message?: string;
          }
        | undefined;

      if (!update) {
        this.addon.log("[HermesClient] session/update with no update field");
        return;
      }

      const sessionUpdateType = update.sessionUpdate || "unknown";

      switch (sessionUpdateType) {
        case "agent_message_chunk": {
          const text = update.content?.text;
          this.addon.log("[HermesClient] agent_message_chunk, text length:", text?.length || 0);
          if (text && this.onUpdateCallback) {
            this.onUpdateCallback({ type: "message", content: text });
          }
          break;
        }

        case "agent_thought_chunk": {
          const text = update.content?.text;
          this.addon.log("[HermesClient] agent_thought_chunk, text length:", text?.length || 0);
          if (text && this.onUpdateCallback) {
            this.onUpdateCallback({ type: "reasoning", reasoning: text });
          }
          break;
        }

        case "usage_update": {
          const usage = update.usage;
          if (usage && this.onUpdateCallback) {
            this.onUpdateCallback({
              type: "usage",
              usage: {
                inputTokens: usage.inputTokens || 0,
                outputTokens: usage.outputTokens || 0,
                totalTokens: usage.totalTokens || 0,
              },
            });
          }
          break;
        }

        case "session_info_update": {
          if (this.onUpdateCallback) {
            this.onUpdateCallback({ type: "session_info" });
          }
          break;
        }

        case "available_commands": {
          const commands = update.availableCommands;
          if (commands) {
            if (this.onAvailableCommandsCallback) {
              this.onAvailableCommandsCallback(commands);
            }
            if (this.onUpdateCallback) {
              this.onUpdateCallback({
                type: "available_commands",
                availableCommands: commands,
              });
            }
          }
          break;
        }

        case "tool_start":
        case "tool_progress":
        case "tool_complete": {
          const toolCall = update.toolCall;
          if (toolCall && this.onUpdateCallback) {
            const updateType = sessionUpdateType as
              | "tool_start"
              | "tool_progress"
              | "tool_complete";
            this.onUpdateCallback({
              type: updateType,
              toolCall,
            });
          }
          if (toolCall && this.onToolUpdateCallback) {
            this.onToolUpdateCallback(
              toolCall.callId,
              toolCall.name,
              toolCall.status,
              toolCall.result,
            );
          }
          break;
        }

        case "terminal_output": {
          const terminal = update.terminal;
          if (terminal && this.onUpdateCallback) {
            this.onUpdateCallback({
              type: "terminal_output",
              terminal,
            });
          }
          break;
        }

        case "error": {
          const errorMsg = update.message;
          if (errorMsg) {
            if (this.onUpdateCallback) {
              this.onUpdateCallback({ type: "error", content: errorMsg });
            }
            if (this.onErrorCallback) {
              this.onErrorCallback(new Error(errorMsg));
            }
          }
          break;
        }

        case "stop":
        case "session_stop": {
          this.addon.log("[HermesClient] session stop notification");
          if (this.onUpdateCallback) {
            this.onUpdateCallback({ type: "stop" });
          }
          break;
        }

        default: {
          // Some updates we can safely ignore (e.g., context updates, mode changes)
          if (
            sessionUpdateType !== "context_update" &&
            sessionUpdateType !== "mode_update" &&
            sessionUpdateType !== "model_update"
          ) {
            this.addon.log("[HermesClient] Unhandled session/update type:", sessionUpdateType);
          }
        }
      }

      return;
    }

    // Legacy direct methods (kept for backward compatibility with older Hermes versions)
    switch (method) {
      case "session/reasoning": {
        const reasoning = params.reasoning as string | undefined;
        if (reasoning && this.onUpdateCallback) {
          this.onUpdateCallback({ type: "reasoning", reasoning });
        }
        break;
      }

      case "session/stop": {
        if (this.onUpdateCallback) {
          this.onUpdateCallback({ type: "stop" });
        }
        break;
      }

      case "session/error": {
        const errorMsg = params.message as string | undefined;
        if (errorMsg) {
          if (this.onUpdateCallback) {
            this.onUpdateCallback({ type: "error", content: errorMsg });
          }
          if (this.onErrorCallback) {
            this.onErrorCallback(new Error(errorMsg));
          }
        }
        break;
      }

      default:
        this.addon.log("[HermesClient] Unhandled ACP notification method:", method);
    }
  }

  /**
   * Initialize the ACP connection with the Hermes server.
   */
  private async initializeConnection(): Promise<void> {
    const messageId = this.generateMessageId();
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: messageId,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
        },
        clientInfo: {
          name: "zotero-hermes",
          version: pkg.version || "0.1.0",
        },
      },
    };

    await this.writeToStdin(JSON.stringify(request) + "\n");

    const response = await this.waitForResponse(messageId);

    if (response.error) {
      throw new Error(
        `ACP initialization failed: ${response.error.message}`,
      );
    }

    this.addon.log("ACP initialized");
  }

  /**
   * Create a new ACP session.
   */
  private async createSession(): Promise<void> {
    const messageId = this.generateMessageId();
    const path = Zotero.getProfileDirectory?.()?.path || "/tmp";
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: messageId,
      method: "session/new",
      params: {
        cwd: path,
        workdir: path,
        mcpServers: [],
      },
    };

    await this.writeToStdin(JSON.stringify(request) + "\n");

    const response = await this.waitForResponse(messageId);

    if (response.error) {
      throw new Error(`Session creation failed: ${response.error.message}`);
    }

    const result = response.result as { sessionId?: string } | undefined;
    this.sessionId = result?.sessionId || null;
    this.addon.log("Session created", { sessionId: this.sessionId });
  }

  /**
   * Write a JSON-RPC message to the subprocess stdin.
   */
  private async writeToStdin(data: string): Promise<void> {
    if (!this.childProcess?.stdin) {
      throw new Error("Not connected to Hermes process");
    }
    try {
      await this.childProcess.stdin.write(data);
    } catch (e: any) {
      this.addon.log("Error writing to Hermes stdin:", e);
      throw e;
    }
  }

  /**
   * Wait for a JSON-RPC response with the given message ID.
   */
  private waitForResponse(messageId: string): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      this.pendingResponses.set(messageId, resolve);
      this.pendingErrors.set(messageId, reject);

      // Timeout after 90 seconds (accommodates slow python agent MCP initialization)
      setTimeout(() => {
        if (this.pendingResponses.has(messageId)) {
          this.pendingResponses.delete(messageId);
          this.pendingErrors.delete(messageId);
          reject(new Error(`Request ${messageId} timed out`));
        }
      }, 90000);
    });
  }

  /**
   * Handle unexpected disconnection (process exit, stream close).
   */
  private handleDisconnect(): void {
    if (!this._isConnected) return;

    this._isConnected = false;
    this.sessionId = null;

    if (this.onErrorCallback) {
      this.onErrorCallback(new Error("Hermes connection closed unexpectedly"));
    }

    // Auto-reconnect with exponential backoff
    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const delay = Math.min(
        1000 * Math.pow(2, this.reconnectAttempts - 1),
        30000,
      );

      this.addon.log(
        `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`,
      );

      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch((err: Error) => {
          this.addon.log("Auto-reconnect failed", err.message);
        });
      }, delay) as unknown as number;
    }
  }

  private generateMessageId(): string {
    return `msg_${++this.messageIdCounter}_${Date.now()}`;
  }
}
