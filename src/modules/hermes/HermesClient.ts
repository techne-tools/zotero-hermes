import { config } from "../../../package.json";
import pkg from "../../../package.json";

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
    | "usage";
  content?: string;
  reasoning?: string;
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

const PROTOCOL_VERSION = "2025-03-18";

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

export interface PromptContextItem {
  id: string;
  type: "note" | "selection" | "folder" | "image" | "pdf" | "item";
  text: string;
  data?: string;
  mimeType?: string;
}

/**
 * Hermes Agent Client for ACP (Agent Client Protocol) connection.
 * Spawns `hermes acp` as a subprocess and communicates via JSON-RPC over stdio.
 * Auto-discovers the binary across $PATH and common install locations.
 */
export class HermesClient {
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
  private currentMessageText = "";
  private activeAbortController: AbortController | null = null;

  constructor(addon: any) {
    this.addon = addon;
  }

  /**
   * Get the connection mode from preferences.
   */
  private getConnectionMode(): "stdio" | "http" {
    const mode = Zotero.Prefs.get(
      `${config.prefsPrefix}.connectionMode`,
      true,
    ) as string;
    return (mode === "http" ? "http" : "stdio");
  }

  /**
   * Get the API URL for HTTP mode.
   */
  private getApiUrl(): string {
    const url =
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.apiUrl`,
        true,
      ) as string) || "http://localhost:8642";
    return url.replace(/\/$/, "");
  }

  /**
   * Get the API key for HTTP mode.
   */
  private getApiKey(): string {
    return (
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.apiKey`,
        true,
      ) as string) || ""
    );
  }

  /**
   * Check if the client has valid configuration.
   */
  public async isReady(): Promise<boolean> {
    const mode = this.getConnectionMode();
    if (mode === "http") {
      return Boolean(this.getApiUrl());
    }
    const hermesPath = Zotero.Prefs.get(
      `${config.prefsPrefix}.hermesBinaryPath`,
      true,
    ) as string;
    return Boolean(hermesPath || (await this.findHermesPath()));
  }

  public getIsConnected(): boolean {
    return this._isConnected;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Connect to Hermes agent.
   */
  public async connect(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    const mode = this.getConnectionMode();

    if (mode === "http") {
      await this.connectHttp();
    } else {
      await this.connectStdio();
    }
  }

  /**
   * Connect via HTTP API.
   */
  private async connectHttp(): Promise<void> {
    const url = this.getApiUrl();
    if (!url) {
      throw new Error(
        "Hermes API URL not configured. Please set it in preferences.",
      );
    }

    try {
      const response = await fetch(`${url}/v1/commands`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this._isConnected = true;
      const pw = new Zotero.ProgressWindow();
      pw.changeHeadline("Connected to Hermes API");
      pw.show();
      pw.startCloseTimer(3000);
    } catch (error) {
      this.plugin.log("HTTP connection failed", error);
      throw new Error(
        `Failed to connect to Hermes API at ${url}. Is the server running?`,
      );
    }
  }

  /**
   * Connect via ACP stdio subprocess.
   */
  private async connectStdio(): Promise<void> {
    const hermesPath =
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.hermesBinaryPath`,
        true,
      ) as string) || (await this.findHermesPath());

    if (!hermesPath) {
      throw new Error(
        "Hermes binary not found. Please install Hermes or set the path in preferences.",
      );
    }

    const { Subprocess } = ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs",
    );
    this.childProcess = await Subprocess.call({
      command: hermesPath,
      arguments: ["acp"],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    this._isConnected = true;
    this.setupStdioHandlers();
    await Zotero.Promise.delay(500);
    await this.initializeConnection();
    await this.createSession();
    const pw = new Zotero.ProgressWindow();
    pw.changeHeadline("Connected to Hermes Agent");
    pw.show();
    pw.startCloseTimer(5000);
  }

  /**
   * Disconnect from Hermes agent.
   */
  public disconnect(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
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
   * Send a prompt to Hermes and stream the response.
   */
  public async sendPrompt(
    text: string,
    contextItems: PromptContextItem[] = [],
    options?: { allowedTools?: string[] | null },
  ): Promise<void> {
    if (!this._isConnected || !this.sessionId) {
      await this.connect();
    }

    this.currentAllowedTools = options?.allowedTools ?? null;

    const messageId = this.generateMessageId();
    const promptBlocks: Array<{ type: string; text: string }> = [];

    // Add context items
    for (const item of contextItems) {
      promptBlocks.push({ type: "text", text: `[${item.type}]: ${item.text}` });
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

    this.writeToStdin(JSON.stringify(request) + "\n");
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
  ): Promise<void> {
    if (!this._isConnected) {
      try {
        await this.connect();
      } catch (error) {
        onError(error as Error);
        return;
      }
    }

    this.onMessageCallback = onMessage;
    this.onCompleteCallback = onComplete;
    this.onErrorCallback = onError;
    this.onToolUpdateCallback = onToolUpdate || null;
    this.currentMessageText = "";

    const mode = this.getConnectionMode();

    if (mode === "http") {
      await this.sendPromptHttp(text, contextItems, onMessage, onComplete, onError);
    } else {
      await this.sendPromptStdio(text, contextItems, onMessage, onComplete, onError);
    }
  }

  /**
   * Send prompt via HTTP API with SSE streaming.
   */
  private async sendPromptHttp(
    text: string,
    contextItems: Array<{ type: string; content: string }>,
    onMessage: (text: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    const url = `${this.getApiUrl()}/v1/chat/completions`;
    const apiKey = this.getApiKey();

    const messages: Array<{ role: string; content: string }> = [];

    for (const item of contextItems) {
      messages.push({
        role: "user",
        content: `[${item.type}]: ${item.content}`,
      });
    }

    messages.push({ role: "user", content: text });

    this.activeAbortController = new AbortController();

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          messages,
          model: "hermes",
          stream: true,
        }),
        signal: this.activeAbortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read(new Uint8Array(1024));
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                onComplete();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  this.currentMessageText += delta;
                  onMessage(this.currentMessageText);
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }

        onComplete();
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          onComplete();
        } else {
          throw error;
        }
      }
    } catch (error) {
      onError(error as Error);
    } finally {
      this.activeAbortController = null;
    }
  }

  /**
   * Send prompt via ACP stdio.
   */
  private async sendPromptStdio(
    text: string,
    contextItems: Array<{ type: string; content: string }>,
    onMessage: (text: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    try {
      const prompt: ContentBlock[] = [];

      for (const item of contextItems) {
        prompt.push({
          type: "text",
          text: `[${item.type}]: ${item.content}`,
        } as ContentBlock);
      }

      prompt.push({
        type: "text",
        text,
      } as ContentBlock);

      const messageId = this.generateMessageId();
      const request = {
        jsonrpc: "2.0" as const,
        id: messageId,
        method: "session/prompt",
        params: {
          sessionId: this.sessionId,
          prompt,
        },
      };

      this.writeToStdin(JSON.stringify(request) + "\n");

      // ACP session/prompt streams updates via session/update notifications.
      // The response with matching id may or may not arrive.
      // We detect completion by waiting for a quiet period after the last chunk.
      await this.waitForPromptComplete(onComplete, 60000);
    } catch (error) {
      onError(error as Error);
    }
  }

  /**
   * Wait for prompt completion by monitoring streaming chunks.
   * Calls onComplete when no chunks arrive for 5 seconds (max 60s).
   */
  private async waitForPromptComplete(
    onComplete: () => void,
    maxWaitMs = 60000,
  ): Promise<void> {
    return new Promise((resolve) => {
      let completed = false;
      let chunkTimer: ReturnType<typeof setTimeout> | null = null;
      let hasReceivedChunk = false;

      const finish = () => {
        if (!completed) {
          completed = true;
          if (chunkTimer) clearTimeout(chunkTimer);
          onComplete();
          resolve();
        }
      };

      // Max wait timer
      const maxTimer = setTimeout(finish, maxWaitMs);

      // Override onMessage to detect chunks
      const originalOnMessage = this.onMessageCallback;
      this.onMessageCallback = (text: string) => {
        // Call original handler
        originalOnMessage?.(text);

        hasReceivedChunk = true;

        // Reset completion timer on each chunk
        if (chunkTimer) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => {
          // 5 seconds of quiet = done
          clearTimeout(maxTimer);
          this.onMessageCallback = originalOnMessage;
          finish();
        }, 5000);
      };

      // Start initial 30s timer (model may take time to start responding)
      chunkTimer = setTimeout(() => {
        clearTimeout(maxTimer);
        this.onMessageCallback = originalOnMessage;
        finish();
      }, 30000);
    });
  }

  /**
   * Cancel the current prompt.
   */
  public async cancelPrompt(): Promise<void> {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      return;
    }

    if (!this.sessionId) return;

    const messageId = this.generateMessageId();
    const request = {
      jsonrpc: "2.0" as const,
      id: messageId,
      method: "session/cancel",
      params: {
        sessionId: this.sessionId,
      },
    };
  }

  // --- Private helpers ---

  /**
   * Resolve the Hermes binary path from preferences or auto-discovery.
   */
  private resolveHermesPath(): string | null {
    const configuredPath = Zotero.Prefs.get(
      `${config.prefsPrefix}.hermesBinaryPath`,
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

    this.childProcess.stdout.on("data", (data: string) => {
      this.stdoutBuffer += data;
      this.processStdoutBuffer();
    });

    this.childProcess.stdout.on("close", () => {
      this.addon.log("Hermes stdout closed");
      this.handleDisconnect();
    });

    this.childProcess.stderr.on("data", (data: string) => {
      const line = data.trim();
      if (line) {
        this.addon.log(`Hermes stderr: ${line}`);
      }
    });

    this.childProcess.on("exit", (code: number | null) => {
      this.addon.log(`Hermes process exited with code ${code}`);
      this.handleDisconnect();
    });
  }

  /**
   * Process buffered stdout data, extracting complete NDJSON lines.
   */
  private processStdoutBuffer(): void {
    let lineEnd = this.stdoutBuffer.indexOf("\n");
    while (lineEnd >= 0) {
      const line = this.stdoutBuffer.slice(0, lineEnd).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(lineEnd + 1);

      if (line) {
        try {
          const message = JSON.parse(line) as
            | JsonRpcResponse
            | JsonRpcNotification;
          this.handleMessage(message);
        } catch (e) {
          this.addon.log("Failed to parse NDJSON line", line);
        }
      }

      lineEnd = this.stdoutBuffer.indexOf("\n");
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
   */
  private handleNotification(notification: JsonRpcNotification): void {
    const method = notification.method;
    const params = notification.params || {};

    switch (method) {
      case "session/update": {
        const content = params.content as string | undefined;
        if (content && this.onUpdateCallback) {
          this.onUpdateCallback({ type: "message", content });
        }
        break;
      }

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

      case "session/tool_start":
      case "session/tool_progress":
      case "session/tool_complete": {
        const toolCall = params.toolCall as
          | {
              callId: string;
              name: string;
              status: "complete" | "error" | "running";
              result?: string;
            }
          | undefined;

        if (toolCall) {
          const updateType = method.replace("session/", "") as
            | "tool_start"
            | "tool_progress"
            | "tool_complete";

          if (this.onUpdateCallback) {
            this.onUpdateCallback({
              type: updateType,
              toolCall,
            });
          }

          if (this.onToolUpdateCallback) {
            this.onToolUpdateCallback(
              toolCall.callId,
              toolCall.name,
              toolCall.status,
              toolCall.result,
            );
          }
        }
        break;
      }

      case "session/usage": {
        const usage = params.usage as
          | { inputTokens: number; outputTokens: number; totalTokens: number }
          | undefined;
        if (usage && this.onUpdateCallback) {
          this.onUpdateCallback({ type: "usage", usage });
        }
        break;
      }

      case "session/error": {
        const errorMsg = params.message as string | undefined;
        if (errorMsg && this.onUpdateCallback) {
          this.onUpdateCallback({ type: "error", content: errorMsg });
        }
        if (errorMsg && this.onErrorCallback) {
          this.onErrorCallback(new Error(errorMsg));
        }
        break;
      }

      case "session/available_commands": {
        const commands = params.commands as
          | Array<{ description: string; name: string }>
          | undefined;
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

      case "session/terminal_output": {
        const terminal = params.terminal as
          | { id: string; output: string; isExited?: boolean }
          | undefined;
        if (terminal && this.onUpdateCallback) {
          this.onUpdateCallback({
            type: "terminal_output",
            terminal,
          });
        }
        break;
      }

      default:
        this.addon.log("Unhandled ACP notification", method, params);
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
          title: config.addonName,
        },
      },
    };

    this.writeToStdin(JSON.stringify(request) + "\n");

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
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: messageId,
      method: "session/new",
      params: {
        cwd: Zotero.getProfileDirectory?.() || "/tmp",
        mcpServers: [],
      },
    };

    this.writeToStdin(JSON.stringify(request) + "\n");

    const response = await this.waitForResponse(messageId);

    if (response.error) {
      throw new Error(`Session creation failed: ${response.error.message}`);
    }

    const result = response.result as { sessionId?: string } | undefined;
    this.sessionId = result?.sessionId || null;
    this.addon.log("Session created", { sessionId: this.sessionId });
  }

  /**
   * Setup stdio handlers for subprocess communication.
   */
  private setupStdioHandlers(): void {
    if (!this.childProcess) return;

    // Start stdout read loop
    this.startStdoutReadLoop();

    // Monitor process exit
    this.childProcess.exitPromise.then(
      (result: { exitCode: number }) => {
        this.plugin.log("Hermes process exited", result.exitCode);
        this._isConnected = false;
        this.sessionId = null;
      },
      (error: Error) => {
        this.plugin.log("Hermes process error", error);
        this._isConnected = false;
        this.sessionId = null;
      },
    );
  }

  /**
   * Continuously read from stdout in a loop.
   */
  private async startStdoutReadLoop(): Promise<void> {
    if (!this.childProcess || !this.childProcess.stdout) return;

    try {
      while (this._isConnected && this.childProcess) {
        const data = await this.childProcess.stdout.readString();
        if (data === null || data === undefined) break;
        if (data) {
          this.handleStdout(data);
        }
        // Small delay to prevent tight loop on empty reads
        if (!data) {
          await Zotero.Promise.delay(50);
        }
      }
    } catch (error) {
      this.plugin.log("Stdout read error", error);
    }
  }

  /**
   * Handle stdout messages from Hermes (NDJSON parsing).
   */
  private handleStdout(data: string): void {
    this.stdoutBuffer += data;

    // Process complete lines (NDJSON)
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleAcpMessage(message);
      } catch (e) {
        this.plugin.log("Failed to parse NDJSON line", line);
      }
    }
  }

  /**
   * Handle parsed ACP messages.
   */
  private handleAcpMessage(message: any): void {
    // Handle responses to our requests
    if (
      message.id !== undefined &&
      (message.result !== undefined || message.error !== undefined)
    ) {
      const id = String(message.id);
      const resolve = this.pendingResponses.get(id);
      const reject = this.pendingErrors.get(id);

      if (resolve) {
        resolve(message);
        this.pendingResponses.delete(id);
        this.pendingErrors.delete(id);
      }
      return;
    }

    // Handle notifications (session updates)
    if (message.method === "session/update" && message.params) {
      this.handleSessionUpdate(message.params as SessionNotification);
      return;
    }

    // Handle agent requests (like fs/read_text_file, request_permission)
    if (message.id !== undefined && message.method) {
      this.handleAgentRequest(message);
      return;
    }
  }

  /**
   * Handle session update notifications (streaming content).
   */
  private handleSessionUpdate(params: SessionNotification): void {
    const update = params.update;

    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const content = update.content;
        if (content.type === "text" && content.text) {
          this.currentMessageText += content.text;
          this.onMessageCallback?.(this.currentMessageText);
        }
        break;
      }

      case "agent_thought_chunk": {
        // Optionally show reasoning - for now, append to message
        const content = update.content;
        if (content.type === "text" && content.text) {
          // Could be shown separately based on settings
        }
        break;
      }

      case "tool_call": {
        this.plugin.log("Tool call", update.title);
        this.onToolUpdateCallback?.(
          update.toolCallId || "unknown",
          update.title || "Tool",
          "running",
          JSON.stringify(update, null, 2),
        );
        break;
      }

      case "tool_call_update": {
        this.plugin.log("Tool call update", update.toolCallId, update.status);
        const statusMap: Record<string, string> = {
          pending: "running",
          in_progress: "running",
          completed: "complete",
          failed: "error",
        };
        const status = statusMap[update.status ?? ""] ?? "running";
        this.onToolUpdateCallback?.(
          update.toolCallId || "unknown",
          update.title || "Tool",
          status,
          JSON.stringify(update, null, 2),
        );
        break;
      }

      case "plan": {
        this.plugin.log("Plan update", update.entries);
        break;
      }

      case "session_info_update": {
        // Session metadata update
        break;
      }

      case "usage_update": {
        // Token usage update
        break;
      }

      default:
        this.plugin.log("Unknown session update", update.sessionUpdate);
    }
  }

  /**
   * Handle agent requests (fs operations, permissions, etc.).
   */
  private async handleAgentRequest(message: any): Promise<void> {
    const { id, method, params } = message;

    switch (method) {
      case "fs/read_text_file": {
        // For now, return empty - Zotero doesn't expose direct file system access
        this.writeToStdin(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { content: "" },
          }) + "\n",
        );
        break;
      }

      case "fs/write_text_file": {
        const { path, content } = params;

        // 1. Route to NoteManager if the path represents a Zotero virtual note
        if (
          path.startsWith("note-") ||
          path.endsWith(".note") ||
          !path.includes("/")
        ) {
          try {
            const notesManager = this.plugin.data?.hermes?.notes;
            if (notesManager) {
              const noteIDMatch = path.match(/^note-(\d+)/);
              const noteID = noteIDMatch ? parseInt(noteIDMatch[1], 10) : null;
              const title = path.replace(/^note-/, "").replace(/\.note$/, "");

              await notesManager.writeNote(noteID, content, title);

              this.writeToStdin(
                JSON.stringify({ jsonrpc: "2.0", id, result: {} }) + "\n",
              );
              break;
            }
          } catch (err) {
            this.plugin.log("Error writing note", err);
            this.writeToStdin(
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                error: {
                  code: -32603,
                  message: `Failed to write note: ${err}`,
                },
              }) + "\n",
            );
            break;
          }
        }

        // 2. Handle physical file writes with user approval
        const approvalDialog = this.plugin.data?.hermes?.approvalDialog;
        if (approvalDialog) {
          let currentContent = "";
          try {
            const file = Zotero.File.pathToFile(path);
            if (file.exists()) {
              currentContent = (Zotero.File as any).getContents(file) || "";
            }
          } catch (e) {
            // Ignore read errors for new files
          }

          const result = await approvalDialog.showNoteApproval(
            "Approve File Write",
            currentContent,
            content,
            path,
          );

          if (result === "approve") {
            try {
              const file = Zotero.File.pathToFile(path);
              Zotero.File.putContents(file, content);
              this.plugin.log("File written successfully", path);
              this.writeToStdin(
                JSON.stringify({ jsonrpc: "2.0", id, result: {} }) + "\n",
              );
            } catch (err) {
              this.plugin.log("Error writing file", err);
              this.writeToStdin(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id,
                  error: {
                    code: -32603,
                    message: `Failed to write file: ${err}`,
                  },
                }) + "\n",
              );
            }
          } else if (result === "modify") {
            // If they click "Modify", tell the agent to ask the user what needs changing!
            this.writeToStdin(
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                error: {
                  code: -32000,
                  message:
                    "User requested modifications. Please ask the user what to change and try again.",
                },
              }) + "\n",
            );
          } else {
            this.writeToStdin(
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                error: { code: -32000, message: "User rejected file write" },
              }) + "\n",
            );
          }
          break;
        }

        // Fallback if no UI available
        this.writeToStdin(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code: -32000, message: "Approval dialog not available" },
          }) + "\n",
        );
        break;
      }

      case "session/request_permission": {
        const toolCall = params.toolCall || {};
        const title = toolCall.title || "Tool Execution";
        const rawInput = toolCall.rawInput;
        const options = params.options || [];

        // Format description text
        let description = `Hermes is requesting permission to execute a tool.`;
        if (toolCall.kind) {
          description = `Hermes is requesting permission to execute '<strong>${toolCall.kind}</strong>'.`;
        }
        if (toolCall.locations && toolCall.locations.length > 0) {
          const escapedLocs = toolCall.locations
            .map((l: any) => l.path)
            .join(", ")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          description += `<br><br><strong>Locations:</strong> ${escapedLocs}`;
        }

        const approvalDialog = this.plugin.data?.hermes?.approvalDialog;
        if (approvalDialog && options.length > 0) {
          const mappedOptions = options.map((o: any) => ({
            id: o.optionId,
            name: o.name || o.optionId,
          }));

          const selectedOptionId = await approvalDialog.showPermissionApproval(
            title,
            description,
            rawInput,
            mappedOptions,
          );

          if (selectedOptionId) {
            this.writeToStdin(
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                result: {
                  outcome: { outcome: "selected", optionId: selectedOptionId },
                },
              }) + "\n",
            );
            break;
          }
        }

        // Fallback or user manually cancelled the request
        this.plugin.log("Permission requested and rejected/cancelled", params);
        this.writeToStdin(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: {
              outcome: {
                outcome: "cancelled",
              },
            },
          }) + "\n",
        );
        break;
      }

      default:
        this.plugin.log("Unknown agent request", method);
        this.writeToStdin(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          }) + "\n",
        );
    }
  }

  /**
   * Write data to the subprocess stdin.
   */
  private writeToStdin(data: string): void {
    if (!this.childProcess?.stdin) {
      throw new Error("Not connected to Hermes process");
    }
    this.childProcess.stdin.write(data);
  }

  /**
   * Wait for a JSON-RPC response with the given message ID.
   */
  private waitForResponse(messageId: string): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      this.pendingResponses.set(messageId, resolve);
      this.pendingErrors.set(messageId, reject);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingResponses.has(messageId)) {
          this.pendingResponses.delete(messageId);
          this.pendingErrors.delete(messageId);
          reject(new Error(`Request ${messageId} timed out`));
        }
      }, 30000);
    });
  }

  /**
   * Handle unexpected disconnection (process exit, stream close).
   */
  private handleDisconnect(): void {
    if (!this._isConnected) return;

  /**
   * Find Hermes binary in common locations.
   */
  private async findHermesPath(): Promise<string | null> {
    const { Subprocess } = ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs",
    );

    try {
      // Try to find hermes in PATH
      const path = await Subprocess.pathSearch("hermes");
      if (path) {
        return path;
      }
    } catch (e) {
      // Not found in PATH, try common locations
    }

    // Get home directory from environment
    const env = Subprocess.getEnvironment();
    const home = env.HOME || env.USERPROFILE || "";

    const paths = [
      "/usr/local/bin/hermes",
      "/opt/homebrew/bin/hermes",
      ...(home ? [`${home}/.local/bin/hermes`] : []),
      ...(home ? [`${home}/bin/hermes`] : []),
    ];

    for (const path of paths) {
      try {
        const file = Zotero.File.pathToFile(path);
        if (file.exists()) {
          return path;
        }
      } catch (e) {
        // Path doesn't exist
      }
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
