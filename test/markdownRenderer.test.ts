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

  it("should auto-link a DOI inside an italic span", function () {
    // Citations are often wrapped in *...* — the DOI must still link.
    const input =
      "*Dalmasso, F. (2013) 'Badiou's Spectator-Subject', Performance Research, 18(1), pp. 77–83. DOI: 10.1080/13528165.2013.789246 — engages the Rhapsody*'s concept.";
    const result = parseInline(input);
    const italic = result.find((s) => s.type === "italic");
    expect(italic).to.exist;
    // The italic segment's content re-parses to include a doi segment
    const inner = parseInline(italic!.content);
    expect(inner).to.deep.include({
      type: "doi",
      content: "DOI: 10.1080/13528165.2013.789246",
      url: "https://doi.org/10.1080/13528165.2013.789246",
    });
  });

  it("should auto-link a bare URL", function () {
    const input =
      "Direct article page: https://www.performancephilosophy.org/journal/article/view/162";
    const result = parseInline(input);
    expect(result).to.deep.include({
      type: "url",
      content: "https://www.performancephilosophy.org/journal/article/view/162",
      url: "https://www.performancephilosophy.org/journal/article/view/162",
    });
  });

  it("should not split a full doi.org URL into url + doi", function () {
    // Regression: the DOI regex used to match the 10.xxxx/... part after
    // the slash in https://doi.org/10.21476/pp.2017.33162, leaving the
    // prefix as plain text and the DOI as a broken half-link.
    const input =
      "DOI link: https://doi.org/10.21476/pp.2017.33162";
    const result = parseInline(input);
    expect(result).to.deep.include({
      type: "url",
      content: "https://doi.org/10.21476/pp.2017.33162",
      url: "https://doi.org/10.21476/pp.2017.33162",
    });
    expect(result).to.not.deep.include({ type: "doi" });
  });
});
