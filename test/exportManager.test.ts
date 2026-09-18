import { expect } from "chai";
import { ExportManager } from "../src/modules/hermes/ExportManager";
import type { Conversation } from "../src/modules/hermes/ConversationManager";
import type { AttachedItem } from "../src/modules/hermes/ItemManager";

describe("ExportManager", function () {
  const mockAddon: any = {
    data: {
      hermes: {
        preferences: {
          get: (key: string, def: any) => def,
        },
      },
    },
    log: () => {},
  };

  it("should format markdown with valid YAML frontmatter, wikilinks, and zotero URIs", function () {
    const exporter = new ExportManager(mockAddon);
    const mockConversation: Conversation = {
      id: "conv_123",
      title: "Quantum Theory Discussion",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "What is quantum entanglement?",
          timestamp: 1690000000000,
        },
        {
          id: "m2",
          role: "assistant",
          content:
            "Quantum entanglement is a phenomenon where particles share quantum states.",
          timestamp: 1690000001000,
        },
      ],
      createdAt: 1690000000000,
      updatedAt: 1690000001000,
      allowedTools: null,
    };

    const mockItem: AttachedItem = {
      id: 101,
      key: "ABCDEF12",
      title:
        "Can Quantum-Mechanical Description of Physical Reality be Complete?",
      itemType: "journalArticle",
      creators: ["Albert Einstein", "Boris Podolsky", "Nathan Rosen"],
      date: "1935",
      abstract: "In a complete theory...",
      tags: ["physics", "quantum"],
      citekey: "Einstein1935",
      attachmentKey: "PDF999",
      doi: "10.1103/PhysRev.47.777",
    };

    const markdown = exporter.exportToMarkdown(mockConversation, [mockItem]);

    // Check YAML Frontmatter
    expect(markdown).to.include("---");
    expect(markdown).to.include('title: "Quantum Theory Discussion"');
    expect(markdown).to.include("tags:\n  - hermes\n  - zotero-chat");
    expect(markdown).to.include('citekey: "Einstein1935"');
    expect(markdown).to.include(
      'zotero_select_uri: "zotero://select/items/ABCDEF12"',
    );
    expect(markdown).to.include(
      'zotero_pdf_uri: "zotero://open-pdf/library/items/PDF999"',
    );

    // Check Attached Sources with wikilinks
    expect(markdown).to.include(
      "[[Can Quantum-Mechanical Description of Physical Reality be Complete?]]",
    );
    expect(markdown).to.include("(`@Einstein1935`)");
    expect(markdown).to.include(
      "[Open in Zotero](zotero://select/items/ABCDEF12)",
    );

    // Check Discussion Section
    expect(markdown).to.include("### 🧑 User\n\nWhat is quantum entanglement?");
    expect(markdown).to.include(
      "### 🤖 Hermes\n\nQuantum entanglement is a phenomenon",
    );
  });
});
