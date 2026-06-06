import type Addon from "../../addon";

import pkg from "../../../package.json";

import { buildSystemPrompt, buildItemContext } from "./systemPrompt";
import { resolveHermesPath, isHermesAvailable, getHomeDir } from "./HermesBinaryFinder";
import type { ChatClient, ChatSessionUpdate, PromptContextItem } from "./types";

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

/**
 * Hermes Agent Client for ACP (Agent Client Protocol) connection.
 * Spawns `hermes acp` as a subprocess and communicates via JSON-RPC over stdio.
 * Auto-discovers the binary across $PATH and common install locations.
 */
export class HermesClient implements ChatClient {
  private childProcess: any | null = null;
  private _isConnected = false;
  private readonly addon: Addon;
  private sessionId: string | null = null;
  private messageIdCounter = 0;
  private pendingResponses = new Map<string, (value: JsonRpcResponse) => void>();
  private pendingErrors = new Map<string, (error: Error) => void>();
  private stdoutBuffer = "";
  private onUpdateCallbacks: ((update: ChatSessionUpdate) => void)[] = [];
  private onErrorCallbacks: ((error: Error) => void)[] = [];
  private onToolUpdateCallbacks:
    | ((
        toolCallId: string,
        title: string,
        status: string,
        payload?: string,
      ) => void)[]
    = [];
  private onAvailableCommandsCallbacks:
    | ((commands: Array<{ description: string; name: string }>) => void)[]
    = [];
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private reconnectTimeout: number | null = null;
  private currentAllowedTools: string[] | null = null;

  constructor(addon: Addon) {
    this.addon = addon;
  }

  /**
   * Gate verbose debug logging behind the debug mode pref,
   * keeping lifecycle-critical messages always visible.
   */
  private logDebug(message: string, ...args: unknown[]): void {
    if (this.addon.data.hermes?.preferences?.get("enableDebugMode", false)) {
      this.addon.log(`[DEBUG] ${message}`, ...args);
    }
  }

  public isReady(): boolean {
    return isHermesAvailable(pkg.config.prefsPrefix);
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
      const hermesPath = resolveHermesPath(pkg.config.prefsPrefix);

      if (!hermesPath) {
        throw new Error(
          "Hermes binary not found. Install Hermes or set the path in preferences.",
        );
      }

      this.addon.log(`Starting Hermes ACP from: ${hermesPath}`);

      this.addon.log(`Spawning Hermes ACP via zsh with manual .zshrc sourcing from: ${hermesPath}`);

      // Spawn hermes acp subprocess using Firefox Subprocess.sys.mjs via zsh.
      const homeDir = getHomeDir();
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
    this.logDebug("[HermesClient] sendPrompt called");
    if (!this._isConnected || !this.sessionId) {
      this.logDebug("[HermesClient] Not connected, calling connect()...");
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

    promptBlocks.push({
      type: "text",
      text: buildSystemPrompt({ zoteroDataDir, zoteroDbPath, zoteroStorageDir, zoteroProfileDir }),
    });

    // Add context items with full metadata
    for (const item of contextItems) {
      promptBlocks.push({ type: "text", text: buildItemContext(item, zoteroStorageDir) });
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

    this.logDebug("[HermesClient] Writing to stdin:", JSON.stringify(request).slice(0, 200));
    this.writeToStdin(JSON.stringify(request) + "\n");
    this.logDebug("[HermesClient] Request sent");
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
    this.onUpdateCallbacks.push(callback);
    return () => {
      const idx = this.onUpdateCallbacks.indexOf(callback);
      if (idx >= 0) this.onUpdateCallbacks.splice(idx, 1);
    };
  }

  public onError(callback: (error: Error) => void): () => void {
    this.onErrorCallbacks.push(callback);
    return () => {
      const idx = this.onErrorCallbacks.indexOf(callback);
      if (idx >= 0) this.onErrorCallbacks.splice(idx, 1);
    };
  }

  public onAvailableCommands(
    callback: (commands: Array<{ description: string; name: string }>) => void,
  ): () => void {
    this.onAvailableCommandsCallbacks.push(callback);
    return () => {
      const idx = this.onAvailableCommandsCallbacks.indexOf(callback);
      if (idx >= 0) this.onAvailableCommandsCallbacks.splice(idx, 1);
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
    this.onToolUpdateCallbacks.push(callback);
    return () => {
      const idx = this.onToolUpdateCallbacks.indexOf(callback);
      if (idx >= 0) this.onToolUpdateCallbacks.splice(idx, 1);
    };
  }

  /** Emit a session update to all registered callbacks */
  private emitUpdate(update: ChatSessionUpdate): void {
    for (const cb of this.onUpdateCallbacks) {
      try { cb(update); } catch { /* swallow */ }
    }
  }

  /** Emit an error to all registered callbacks */
  private emitError(error: Error): void {
    for (const cb of this.onErrorCallbacks) {
      try { cb(error); } catch { /* swallow */ }
    }
  }

  /** Emit a tool update to all registered callbacks */
  private emitToolUpdate(toolCallId: string, title: string, status: string, payload?: string): void {
    for (const cb of this.onToolUpdateCallbacks) {
      try { cb(toolCallId, title, status, payload); } catch { /* swallow */ }
    }
  }

  /** Emit available commands to all registered callbacks */
  private emitAvailableCommands(commands: Array<{ description: string; name: string }>): void {
    for (const cb of this.onAvailableCommandsCallbacks) {
      try { cb(commands); } catch { /* swallow */ }
    }
  }

  // --- Private helpers ---

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
      this.logDebug("[HermesClient] processStdoutBuffer: processed ${processedCount} lines");
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
        this.logDebug("[HermesClient] session/update with no update field");
        return;
      }

      const sessionUpdateType = update.sessionUpdate || "unknown";

      switch (sessionUpdateType) {
        case "agent_message_chunk": {
          const text = update.content?.text;
          this.logDebug("[HermesClient] agent_message_chunk, text length:", text?.length || 0);
          if (text) {
            this.emitUpdate({ type: "message", content: text });
          }
          break;
        }

        case "agent_thought_chunk": {
          const text = update.content?.text;
          this.logDebug("[HermesClient] agent_thought_chunk, text length:", text?.length || 0);
          if (text) {
            this.emitUpdate({ type: "reasoning", reasoning: text });
          }
          break;
        }

        case "usage_update": {
          const usage = update.usage;
          if (usage) {
            this.emitUpdate({
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
          this.emitUpdate({ type: "session_info" });
          break;
        }

        case "available_commands": {
          const commands = update.availableCommands;
          if (commands) {
            this.emitAvailableCommands(commands);
            this.emitUpdate({
              type: "available_commands",
              availableCommands: commands,
            });
          }
          break;
        }

        case "tool_start":
        case "tool_progress":
        case "tool_complete": {
          const toolCall = update.toolCall;
          if (toolCall) {
            const updateType = sessionUpdateType as
              | "tool_start"
              | "tool_progress"
              | "tool_complete";
            this.emitUpdate({
              type: updateType,
              toolCall,
            });
          }
          if (toolCall) {
            this.emitToolUpdate(toolCall.callId, toolCall.name, toolCall.status, toolCall.result);
          }
          break;
        }

        case "terminal_output": {
          const terminal = update.terminal;
          if (terminal) {
            // Check allowTerminal preference — block if not enabled
            const allowTerminal = this.addon.data.hermes?.preferences?.get("allowTerminal", false) ?? false;
            if (!allowTerminal) {
              this.addon.log("[HermesClient] Terminal output blocked: allowTerminal pref is false");
              return;
            }
            this.emitUpdate({
              type: "terminal_output",
              terminal,
            });
          }
          break;
        }

        case "error": {
          const errorMsg = update.message;
          if (errorMsg) {
            this.emitUpdate({ type: "error", content: errorMsg });
            this.emitError(new Error(errorMsg));
          }
          break;
        }

        case "stop":
        case "session_stop": {
          this.addon.log("[HermesClient] session stop notification");
          this.emitUpdate({ type: "stop" });
          break;
        }

        default: {
          // Some updates we can safely ignore (e.g., context updates, mode changes)
          if (
            sessionUpdateType !== "context_update" &&
            sessionUpdateType !== "mode_update" &&
            sessionUpdateType !== "model_update"
          ) {
            this.logDebug("[HermesClient] Unhandled session/update type:", sessionUpdateType);
          }
        }
      }

      return;
    }

    // Legacy direct methods (kept for backward compatibility with older Hermes versions)
    switch (method) {
      case "session/reasoning": {
        const reasoning = params.reasoning as string | undefined;
        if (reasoning) {
          this.emitUpdate({ type: "reasoning", reasoning });
        }
        break;
      }

      case "session/stop": {
        this.emitUpdate({ type: "stop" });
        break;
      }

      case "session/error": {
        const errorMsg = params.message as string | undefined;
        if (errorMsg) {
          this.emitUpdate({ type: "error", content: errorMsg });
          this.emitError(new Error(errorMsg));
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
        workdir: path,
        mcpServers: this.getMcpServers(),
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

    this.emitError(new Error("Hermes connection closed unexpectedly"));

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

  /**
   * Read MCP server config from preferences.
   * Returns one path per line as an array, or empty array if disabled.
   */
  private getMcpServers(): string[] {
    const enabled = this.addon.data.hermes?.preferences?.get("mcpServersEnabled", false) ?? false;
    if (!enabled) return [];
    const list = this.addon.data.hermes?.preferences?.get("mcpServersList", "") ?? "";
    return list
      .split("\n")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }
}
