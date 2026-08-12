import { expect } from "chai";
import { HermesClient } from "../src/modules/hermes/HermesClient";
import type Addon from "../src/addon";
import type { ChatSessionUpdate } from "../src/modules/hermes/types";

/**
 * Mock subprocess with a controllable stdout.onInput handler, mirroring
 * the shape of Firefox's Subprocess.sys.mjs process object.
 */
function makeMockChildProcess() {
  const stdout = { onInput: null as null | ((data: ArrayBuffer) => void) };
  const stderr = { onInput: null as null | ((data: ArrayBuffer) => void) };
  const stdin = { write: async () => {} };
  const child = {
    stdout,
    stderr,
    stdin,
    kill: () => {},
    wait: () => new Promise(() => {}),
  };
  return child;
}

function makeAddon(prefs: Record<string, unknown> = {}) {
  const addon = {
    data: {
      hermes: {
        preferences: {
          get: (key: string, fallback: unknown) =>
            key in prefs ? prefs[key] : fallback,
        },
      },
    },
    log: () => {},
  } as unknown as Addon;
  return addon;
}

function encode(line: string): ArrayBuffer {
  return new TextEncoder().encode(line + "\n").buffer;
}

describe("HermesClient NDJSON handling", function () {
  it("should emit message chunks from agent_message_chunk notifications", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "Hello " },
            },
          },
        }),
      ),
    );
    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "world" },
            },
          },
        }),
      ),
    );

    expect(updates.filter((u) => u.type === "message")).to.have.length(2);
    expect(updates[0]).to.deep.include({ type: "message", content: "Hello " });
    expect(updates[1]).to.deep.include({ type: "message", content: "world" });
  });

  it("should emit reasoning chunks from agent_thought_chunk", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: "thinking..." },
            },
          },
        }),
      ),
    );

    expect(updates[0]).to.deep.include({
      type: "reasoning",
      reasoning: "thinking...",
    });
  });

  it("should emit usage updates", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: {
              sessionUpdate: "usage_update",
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            },
          },
        }),
      ),
    );

    expect(updates[0]).to.deep.include({ type: "usage" });
    expect(updates[0].usage).to.deep.equal({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it("should emit tool updates and tool callbacks", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    const toolUpdates: Array<[string, string, string]> = [];
    client.onUpdate((u) => updates.push(u));
    client.onToolUpdate((id, name, status) =>
      toolUpdates.push([id, name, status]),
    );

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: {
              sessionUpdate: "tool_complete",
              toolCall: {
                callId: "call_1",
                name: "read_file",
                status: "complete",
                result: "file contents",
              },
            },
          },
        }),
      ),
    );

    expect(updates[0]).to.deep.include({ type: "tool_complete" });
    expect(updates[0].toolCall).to.deep.include({
      callId: "call_1",
      name: "read_file",
      status: "complete",
    });
    expect(toolUpdates).to.deep.equal([["call_1", "read_file", "complete"]]);
  });

  it("should emit available commands", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const commands: Array<{ description: string; name: string }> = [];
    client.onAvailableCommands((c) => commands.push(...c));

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: {
              sessionUpdate: "available_commands",
              availableCommands: [
                { name: "cite", description: "Cite an item" },
              ],
            },
          },
        }),
      ),
    );

    expect(commands).to.deep.equal([
      { name: "cite", description: "Cite an item" },
    ]);
  });

  it("should emit stop on session stop", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: { sessionUpdate: "stop" },
          },
        }),
      ),
    );

    expect(updates[0]).to.deep.include({ type: "stop" });
  });

  it("should emit error and onError callback for error updates", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    const errors: Error[] = [];
    client.onUpdate((u) => updates.push(u));
    client.onError((e) => errors.push(e));

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: { sessionUpdate: "error", message: "Something failed" },
          },
        }),
      ),
    );

    expect(updates[0]).to.deep.include({
      type: "error",
      content: "Something failed",
    });
    expect(errors[0].message).to.equal("Something failed");
  });

  it("should block terminal output when allowTerminal is false", function () {
    const client = new HermesClient(makeAddon({ allowTerminal: false }));
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: {
              sessionUpdate: "terminal_output",
              terminal: { id: "t1", output: "ls" },
            },
          },
        }),
      ),
    );

    expect(updates).to.have.length(0);
  });

  it("should pass terminal output when allowTerminal is true", function () {
    const client = new HermesClient(makeAddon({ allowTerminal: true }));
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: {
              sessionUpdate: "terminal_output",
              terminal: { id: "t1", output: "ls", isExited: false },
            },
          },
        }),
      ),
    );

    expect(updates[0]).to.deep.include({ type: "terminal_output" });
    expect(updates[0].terminal).to.deep.include({ id: "t1", output: "ls" });
  });

  it("should handle legacy session/stop notifications", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/stop",
          params: { sessionId: "s1" },
        }),
      ),
    );

    expect(updates[0]).to.deep.include({ type: "stop" });
  });

  it("should resolve pending responses by id", async function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const responsePromise = (client as any).waitForResponse("msg_1");
    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "msg_1",
          result: { sessionId: "s1" },
        }),
      ),
    );

    const response = await responsePromise;
    expect(response.result).to.deep.equal({ sessionId: "s1" });
  });

  it("should split multiple NDJSON lines in a single chunk", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    const line1 = JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "one" },
        },
      },
    });
    const line2 = JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "two" },
        },
      },
    });

    child.stdout.onInput!(new TextEncoder().encode(`${line1}\n${line2}\n`).buffer);

    expect(updates.filter((u) => u.type === "message")).to.have.length(2);
    expect(updates[0]).to.deep.include({ content: "one" });
    expect(updates[1]).to.deep.include({ content: "two" });
  });

  it("should buffer partial lines across chunks", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    const line = JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "partial" },
        },
      },
    });

    // First chunk: half the line, no newline
    const half = Math.floor(line.length / 2);
    child.stdout.onInput!(
      new TextEncoder().encode(line.slice(0, half)).buffer,
    );
    expect(updates).to.have.length(0);

    // Second chunk: rest of the line + newline
    child.stdout.onInput!(
      new TextEncoder().encode(line.slice(half) + "\n").buffer,
    );
    expect(updates).to.have.length(1);
    expect(updates[0]).to.deep.include({ content: "partial" });
  });

  it("should ignore malformed NDJSON lines", function () {
    const client = new HermesClient(makeAddon());
    const child = makeMockChildProcess();
    (client as any).childProcess = child;
    (client as any).setupStdioHandlers();

    const updates: ChatSessionUpdate[] = [];
    client.onUpdate((u) => updates.push(u));

    child.stdout.onInput!(encode("{not valid json"));
    child.stdout.onInput!(
      encode(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "s1",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "after bad line" },
            },
          },
        }),
      ),
    );

    expect(updates.filter((u) => u.type === "message")).to.have.length(1);
    expect(updates[0]).to.deep.include({ content: "after bad line" });
  });
});
