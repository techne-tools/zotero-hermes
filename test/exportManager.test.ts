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

  it("should generate valid Obsidian Canvas (.canvas) JSON graph with nodes and edges", function () {
    const exporter = new ExportManager(mockAddon);
    const mockConversation: Conversation = {
      id: "conv_canvas",
      title: "Neural Architectures Graph",
      messages: [],
      createdAt: 1690000000000,
      updatedAt: 1690000000000,
      allowedTools: null,
    };

    const item1: AttachedItem = {
      id: 1,
      key: "KEY1",
      title: "Attention Is All You Need",
      itemType: "conferencePaper",
      creators: ["Vaswani et al."],
      date: "2017",
      citekey: "vaswani2017attention",
      attachmentKey: "PDF1",
    };

    const item2: AttachedItem = {
      id: 2,
      key: "KEY2",
      title: "BERT: Pre-training of Deep Bidirectional Transformers",
      itemType: "conferencePaper",
      creators: ["Devlin et al."],
      date: "2018",
      citekey: "devlin2018bert",
      attachmentKey: "PDF2",
    };

    const canvasJson = exporter.exportToCanvas(mockConversation, [
      item1,
      item2,
    ]);
    const parsed = JSON.parse(canvasJson);

    expect(parsed).to.have.property("nodes").that.is.an("array");
    expect(parsed).to.have.property("edges").that.is.an("array");

    // Header node + 2 paper nodes = 3 nodes
    expect(parsed.nodes).to.have.lengthOf(3);
    const headerNode = parsed.nodes.find((n: any) => n.id === "root-header");
    expect(headerNode).to.exist;
    expect(headerNode.text).to.include("Neural Architectures Graph");

    const paper1Node = parsed.nodes.find((n: any) => n.id === "paper-KEY1");
    expect(paper1Node).to.exist;
    expect(paper1Node.text).to.include("[[Attention Is All You Need]]");
    expect(paper1Node.text).to.include("@vaswani2017attention");

    // Edges: 2 header edges + 1 chronological edge (2017 -> 2018)
    expect(parsed.edges).to.have.lengthOf(3);
    const chronoEdge = parsed.edges.find((e: any) => e.label === "precedes");
    expect(chronoEdge).to.exist;
    expect(chronoEdge.fromNode).to.equal("paper-KEY1");
    expect(chronoEdge.toNode).to.equal("paper-KEY2");
  });
});
