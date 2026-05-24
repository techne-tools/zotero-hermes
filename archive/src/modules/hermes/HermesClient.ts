import { config } from "../../../package.json";
import pkg from "../../../package.json";
import * as acp from "@agentclientprotocol/sdk";
import type {
  ContentBlock,
  SessionNotification,
  InitializeResponse,
  NewSessionResponse,
} from "@agentclientprotocol/sdk/dist/schema/types.gen.js";

/**
 * Hermes Agent Client for ACP (Agent Client Protocol) connection.
 * Spawns hermes acp as a subprocess and communicates via JSON-RPC over stdio.
 */
export class HermesClient {
  private childProcess: any | null = null;
  private _isConnected = false;
  private readonly plugin: any;
  private sessionId: string | null = null;
  private messageIdCounter = 0;
  private pendingResponses = new Map<string, (value: unknown) => void>();
  private pendingErrors = new Map<string, (error: Error) => void>();
  private stdoutBuffer = "";
  private onMessageCallback: ((text: string) => void) | null = null;
  private onCompleteCallback: (() => void) | null = null;
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

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  /**
   * Check if the client has valid configuration.
   */
  public isReady(): boolean {
    const hermesPath = Zotero.Prefs.get(
      `${config.prefsPrefix}.hermesBinaryPath`,
      true,
    ) as string;
    return Boolean(hermesPath || this.findHermesPath());
  }

  /**
   * Check if connected to the agent.
   */
  public getIsConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Get current session ID.
   */
  public getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Connect to Hermes agent via ACP protocol.
   */
  public async connect(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    try {
      const hermesPath =
        (Zotero.Prefs.get(
          `${config.prefsPrefix}.hermesBinaryPath`,
          true,
        ) as string) || this.findHermesPath();

      if (!hermesPath) {
        throw new Error(
          "Hermes binary not found. Please install Hermes or set the path in preferences.",
        );
      }

      // Spawn hermes acp subprocess
      const { spawn } = ChromeUtils.importESModule(
        "resource://gre/modules/childprocess.jsm",
      );
      this.childProcess = spawn(hermesPath, ["acp"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Setup communication handlers
      this.setupStdioHandlers();

      // Wait for process to be ready
      await Zotero.Promise.delay(500);

      // Initialize ACP connection
      await this.initializeConnection();

      // Create a new session
      await this.createSession();

      this._isConnected = true;
      const pw = new Zotero.ProgressWindow();
      pw.changeHeadline("Connected to Hermes Agent");
      pw.show();
      pw.startCloseTimer(5000);
    } catch (error) {
      this.plugin.log("Connection failed", error);
      this.disconnect();
      throw error;
    }
  }

  /**
   * Disconnect from Hermes agent.
   */
  public disconnect(): void {
    if (this.childProcess) {
      try {
        this.childProcess.kill();
      } catch (e) {
        // Process may already be dead
      }
      this.childProcess = null;
    }
    this._isConnected = false;
    this.sessionId = null;
    this.stdoutBuffer = "";
    this.pendingResponses.clear();
    this.pendingErrors.clear();
  }

  /**
   * Send a prompt to Hermes and stream the response.
   * @param text - User message text
   * @param contextItems - Optional context items to include
   * @param onMessage - Callback for each message chunk
   * @param onComplete - Callback when response is complete
   * @param onError - Callback on error
   */
  public async sendPrompt(
    text: string,
    contextItems: Array<{ type: string; content: string }> = [],
    onMessage: (text: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    onToolUpdate?: (
      toolCallId: string,
      title: string,
      status: string,
      payload?: string,
    ) => void,
  ): Promise<void> {
    if (!this._isConnected || !this.sessionId) {
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

    try {
      // Build prompt content blocks
      const prompt: ContentBlock[] = [];

      // Add context items as resource links
      for (const item of contextItems) {
        prompt.push({
          type: "text",
          text: `[${item.type}]: ${item.content}`,
        } as ContentBlock);
      }

      // Add user message
      prompt.push({
        type: "text",
        text,
      } as ContentBlock);

      // Send prompt via ACP
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

      // Write request to stdin
      const requestJson = JSON.stringify(request) + "\n";
      this.writeToStdin(requestJson);

      // Wait for prompt response (completion signal)
      await this.waitForResponse(messageId);
    } catch (error) {
      onError(error as Error);
    }
  }

  /**
   * Cancel the current prompt.
   */
  public async cancelPrompt(): Promise<void> {
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

    this.writeToStdin(JSON.stringify(request) + "\n");
  }

  /**
   * Initialize the ACP connection.
   */
  private async initializeConnection(): Promise<void> {
    const messageId = this.generateMessageId();
    const request = {
      jsonrpc: "2.0" as const,
      id: messageId,
      method: "initialize",
      params: {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
        },
        clientInfo: {
          name: "zotero-hermes",
          version: pkg.version || "0.1.0",
          title: "Hermes Agent for Zotero",
        },
      },
    };

    this.writeToStdin(JSON.stringify(request) + "\n");

    const response = (await this.waitForResponse(messageId)) as {
      result?: InitializeResponse;
      error?: { message: string };
    };

    if (response.error) {
      throw new Error(`ACP initialization failed: ${response.error.message}`);
    }

    this.plugin.log("ACP initialized", response.result);
  }

  /**
   * Create a new ACP session.
   */
  private async createSession(): Promise<void> {
    const messageId = this.generateMessageId();
    const request = {
      jsonrpc: "2.0" as const,
      id: messageId,
      method: "session/new",
      params: {
        cwd: "/tmp",
        mcpServers: [],
      },
    };

    this.writeToStdin(JSON.stringify(request) + "\n");

    const response = (await this.waitForResponse(messageId)) as {
      result?: NewSessionResponse;
      error?: { message: string };
    };

    if (response.error) {
      throw new Error(`Session creation failed: ${response.error.message}`);
    }

    this.sessionId = response.result?.sessionId || null;
    this.plugin.log("Session created", this.sessionId);
  }

  /**
   * Setup stdio handlers for subprocess communication.
   */
  private setupStdioHandlers(): void {
    if (!this.childProcess) return;

    this.childProcess.stdout.on("data", (data: Buffer) => {
      this.handleStdout(data.toString());
    });

    this.childProcess.stderr.on("data", (data: Buffer) => {
      const stderr = data.toString();
      this.plugin.log("Hermes stderr", stderr);
    });

    this.childProcess.on("exit", (code: number) => {
      this.plugin.log("Hermes process exited", code);
      this._isConnected = false;
      this.sessionId = null;
    });
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
    if (!this.childProcess || !this.childProcess.stdin) {
      throw new Error("Not connected to Hermes process");
    }

    try {
      this.childProcess.stdin.write(data);
    } catch (error) {
      this.plugin.log("Failed to write to stdin", error);
      throw error;
    }
  }

  /**
   * Wait for a response to a request.
   */
  private async waitForResponse(
    messageId: string,
    timeout = 30000,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pendingResponses.set(messageId, resolve);
      this.pendingErrors.set(messageId, reject);

      // Timeout
      setTimeout(() => {
        if (this.pendingResponses.has(messageId)) {
          this.pendingResponses.delete(messageId);
          this.pendingErrors.delete(messageId);
          reject(
            new Error(`Request ${messageId} timed out after ${timeout}ms`),
          );
        }
      }, timeout);
    });
  }

  /**
   * Generate unique message ID.
   */
  private generateMessageId(): string {
    return `msg-${++this.messageIdCounter}-${Date.now()}`;
  }

  /**
   * Find Hermes binary in common locations.
   */
  private findHermesPath(): string | null {
    const paths = [
      "/usr/local/bin/hermes",
      "/opt/homebrew/bin/hermes",
      "~/.local/bin/hermes",
    ];

    for (const path of paths) {
      const file = Zotero.File.pathToFile(path);
      if (file.exists()) {
        return path;
      }
    }

    return null;
  }
}
