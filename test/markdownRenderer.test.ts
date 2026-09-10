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

  it("should auto-link a bare DOI", function () {
    const input = "See 10.1000/xyz123 for details";
    const result = parseInline(input);
    expect(result).to.deep.include({
      type: "doi",
      content: "10.1000/xyz123",
      url: "https://doi.org/10.1000/xyz123",
    });
  });

  it("should auto-link a DOI with doi: prefix", function () {
    const input = "See doi:10.1234/abc.5678 for details";
    const result = parseInline(input);
    expect(result).to.deep.include({
      type: "doi",
      content: "doi:10.1234/abc.5678",
      url: "https://doi.org/10.1234/abc.5678",
    });
  });

  it("should not treat a plain number as a DOI", function () {
    const input = "Version 10.5 is out";
    const result = parseInline(input);
    expect(result).to.not.deep.include({ type: "doi" });
  });
});
