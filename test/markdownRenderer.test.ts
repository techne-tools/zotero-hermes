import { expect } from "chai";
import { parseInline } from "../src/utils/MarkdownRenderer";

describe("MarkdownRenderer (parseInline)", function () {
  it("should parse bold text", function () {
    const input = "This is **bold** text";
    const result = parseInline(input);
    expect(result).to.deep.include({ type: "bold", content: "bold" });
  });

  it("should parse italic text", function () {
    const input = "This is *italic* text";
    const result = parseInline(input);
    expect(result).to.deep.include({ type: "italic", content: "italic" });
  });

  it("should parse inline code", function () {
    const input = "Use `npm install` to start";
    const result = parseInline(input);
    expect(result).to.deep.include({ type: "code", content: "npm install" });
  });

  it("should parse links", function () {
    const input = "Check [this link](https://example.com)";
    const result = parseInline(input);
    expect(result).to.deep.include({
      type: "link",
      content: "this link",
      url: "https://example.com",
    });
  });
});
