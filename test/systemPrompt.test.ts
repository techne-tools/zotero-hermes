import { expect } from "chai";
import {
  buildSystemPrompt,
  buildItemContext,
} from "../src/modules/hermes/systemPrompt";

describe("systemPrompt.buildSystemPrompt", function () {
  const baseOpts = {
    zoteroDataDir: "/Users/test/Zotero",
    zoteroDbPath: "/Users/test/Zotero/zotero.sqlite",
    zoteroStorageDir: "/Users/test/Zotero/storage",
    zoteroProfileDir: "/Users/test/Library/Application Support/Zotero/Profiles/abc.default",
  };

  it("should default to the research assistant persona", function () {
    const prompt = buildSystemPrompt(baseOpts);
    expect(prompt).to.include("Research Assistant");
    expect(prompt).to.not.include("Citation Expert");
    expect(prompt).to.not.include("Literature Analyst");
  });

  it("should select the citation persona", function () {
    const prompt = buildSystemPrompt({ ...baseOpts, persona: "citation" });
    expect(prompt).to.include("Citation Expert");
  });

  it("should select the analyst persona", function () {
    const prompt = buildSystemPrompt({ ...baseOpts, persona: "analyst" });
    expect(prompt).to.include("Literature Analyst");
  });

  it("should include the Zotero data directory and database path", function () {
    const prompt = buildSystemPrompt(baseOpts);
    expect(prompt).to.include("/Users/test/Zotero");
    expect(prompt).to.include("/Users/test/Zotero/zotero.sqlite");
    expect(prompt).to.include("/Users/test/Zotero/storage");
  });

  it("should state that MCP tools are unavailable", function () {
    const prompt = buildSystemPrompt(baseOpts);
    expect(prompt).to.include("MCP tools are NOT available");
  });

  it("should instruct the agent to answer from attached metadata", function () {
    const prompt = buildSystemPrompt(baseOpts);
    expect(prompt).to.include("ANSWER DIRECTLY using the provided metadata");
  });
});

describe("systemPrompt.buildItemContext", function () {
  const storageDir = "/Users/test/Zotero/storage";

  it("should build a minimal context line for non-item types", function () {
    const text = buildItemContext(
      { type: "selection", text: "selected passage" },
      storageDir,
    );
    expect(text).to.equal("[selection]: selected passage");
  });

  it("should include extracted metadata fields", function () {
    const text = buildItemContext(
      {
        type: "item",
        text: "Some paper",
        extracted: {
          title: "Some paper",
          creators: ["Jane Doe", "John Smith"],
          date: "2024",
          abstract: "An abstract.",
          tags: ["sound", "theatre"],
          doi: "10.1234/example",
          url: "https://example.com/paper",
          itemType: "journalArticle",
        },
      },
      storageDir,
    );
    expect(text).to.include("[item]: Some paper");
    expect(text).to.include("Title: Some paper");
    expect(text).to.include("Authors: Jane Doe, John Smith");
    expect(text).to.include("Date: 2024");
    expect(text).to.include("Abstract: An abstract.");
    expect(text).to.include("Tags: sound, theatre");
    expect(text).to.include("DOI: 10.1234/example");
    expect(text).to.include("URL: https://example.com/paper");
    expect(text).to.include("Item type: journalArticle");
  });

  it("should include attachment key and storage path when present", function () {
    const text = buildItemContext(
      {
        type: "item",
        text: "Paper with PDF",
        extracted: {
          title: "Paper with PDF",
          attachmentKey: "XYZ789",
          storagePath: "/Users/test/Zotero/storage/XYZ789/paper.pdf",
        },
      },
      storageDir,
    );
    expect(text).to.include("Zotero attachment key: XYZ789");
    expect(text).to.include(
      "Zotero storage path: /Users/test/Zotero/storage/XYZ789/",
    );
    expect(text).to.include(
      "Zotero file path: /Users/test/Zotero/storage/XYZ789/paper.pdf",
    );
  });

  it("should include item key and id from data JSON", function () {
    const text = buildItemContext(
      {
        type: "item",
        text: "Paper",
        data: JSON.stringify({ key: "ABC123", id: 42 }),
      },
      storageDir,
    );
    expect(text).to.include("Zotero item key: ABC123");
    expect(text).to.include("Zotero item ID: 42");
  });

  it("should tolerate malformed data JSON", function () {
    const text = buildItemContext(
      { type: "item", text: "Paper", data: "{not json" },
      storageDir,
    );
    expect(text).to.equal("[item]: Paper");
  });

  it("should omit empty optional fields", function () {
    const text = buildItemContext(
      {
        type: "item",
        text: "Paper",
        extracted: { title: "Paper" },
      },
      storageDir,
    );
    expect(text).to.not.include("Authors:");
    expect(text).to.not.include("DOI:");
    expect(text).to.not.include("Zotero attachment key:");
  });
});
