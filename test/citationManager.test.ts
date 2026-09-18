import { expect } from "chai";
import { CitationManager } from "../src/modules/hermes/CitationManager";

describe("CitationManager", function () {
  const mockAddon: any = {
    data: {},
    log: () => {},
  };

  it("should extract citekey from citationKey field or extra or author-year fallback", function () {
    const manager = new CitationManager(mockAddon);

    // Test with citationKey field
    const mockItemWithKey: any = {
      id: 1,
      getField: (field: string) => {
        if (field === "citationKey") return "Knuth1984";
        return "";
      },
      getCreators: () => [],
    };
    expect(manager.getCitekey(mockItemWithKey)).to.equal("Knuth1984");

    // Test with extra field containing bibtex key
    const mockItemWithExtra: any = {
      id: 2,
      getField: (field: string) => {
        if (field === "extra") return "Citation Key: Shannon1948\nPMID: 12345";
        return "";
      },
      getCreators: () => [],
    };
    expect(manager.getCitekey(mockItemWithExtra)).to.equal("Shannon1948");

    // Test with author-year fallback
    const mockItemFallback: any = {
      id: 3,
      getField: (field: string) => {
        if (field === "date") return "2020-05-12";
        return "";
      },
      getCreators: () => [{ lastName: "Turing" }],
    };
    expect(manager.getCitekey(mockItemFallback)).to.equal("Turing2020");
  });

  it("should generate pandoc, latex, and typst citation snippets", function () {
    const manager = new CitationManager(mockAddon);
    const mockItem: any = {
      id: 10,
      getField: (field: string) =>
        field === "citationKey" ? "Einstein1905" : "",
      getCreators: () => [],
    };

    const snippets = manager.getCitationSnippets(mockItem);
    expect(snippets.citekey).to.equal("Einstein1905");
    expect(snippets.pandoc).to.equal("[@Einstein1905]");
    expect(snippets.latex).to.equal("\\cite{Einstein1905}");
    expect(snippets.typst).to.equal("@Einstein1905");
  });
});
