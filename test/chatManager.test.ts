import { expect } from "chai";
import { ChatManager } from "../src/modules/hermes/ChatManager";
import type { Conversation } from "../src/modules/hermes/ConversationManager";
import type { ChatMessage } from "../src/views/types";
import type Addon from "../src/addon";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "user",
    content: "hello",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv_1",
    title: "Test",
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    allowedTools: null,
    ...overrides,
  };
}

/** Build an addon whose conversations manager is a spy. */
function makeAddon() {
  const saved: Conversation[] = [];
  const conversations = {
    getCurrentConversation: () => saved[saved.length - 1] || null,
    saveConversation: (conv: Conversation) => {
      saved.push(conv);
    },
    clearMessages: () => {
      saved.length = 0;
    },
  };
  const addon = {
    data: { hermes: { conversations } },
  } as unknown as Addon;
  return { addon, conversations, saved };
}

describe("ChatManager", function () {
  it("should add messages and return a copy of the array", function () {
    const { addon } = makeAddon();
    const manager = new ChatManager(addon);
    manager.addMessage(makeMessage({ id: "a" }));
    manager.addMessage(makeMessage({ id: "b", role: "assistant" }));

    const messages = manager.getMessages();
    expect(messages).to.have.length(2);
    // Pushing to the returned array must not affect internal state
    messages.push(makeMessage({ id: "c" }));
    expect(manager.getMessages()).to.have.length(2);
  });

  it("should flush pending saves immediately", function () {
    const { addon, saved } = makeAddon();
    const manager = new ChatManager(addon);
    const conv = makeConversation();
    saved.push(conv);

    manager.addMessage(makeMessage({ id: "a" }));
    manager.flush();

    expect(saved[saved.length - 1].messages).to.have.length(1);
    expect(saved[saved.length - 1].messages[0].id).to.equal("a");
  });

  it("should clear messages and flush immediately", function () {
    const { addon, saved } = makeAddon();
    const manager = new ChatManager(addon);
    const conv = makeConversation();
    saved.push(conv);

    manager.addMessage(makeMessage({ id: "a" }));
    manager.clearMessages();

    expect(manager.getMessages()).to.have.length(0);
    expect(saved).to.have.length(0);
  });

  it("should load messages from a conversation", function () {
    const { addon } = makeAddon();
    const manager = new ChatManager(addon);
    const conv = makeConversation({
      messages: [makeMessage({ id: "x" })],
    });
    manager.loadFromConversation(conv);
    expect(manager.getMessages()).to.have.length(1);
    expect(manager.getMessages()[0].id).to.equal("x");
  });

  it("should set messages and schedule a save", function () {
    const { addon, saved } = makeAddon();
    const manager = new ChatManager(addon);
    const conv = makeConversation();
    saved.push(conv);

    manager.setMessages([makeMessage({ id: "z" })]);
    manager.flush();

    expect(saved[saved.length - 1].messages).to.have.length(1);
    expect(saved[saved.length - 1].messages[0].id).to.equal("z");
  });
});
