/**
 * Manages citation generation using Zotero's configured citation style.
 */
export class CitationManager {
  private readonly plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  /**
   * Get the currently configured citation style from Zotero preferences.
   */
  public getCurrentStyle(): string {
    return (
      (Zotero.Prefs.get("export.lastStyle") as string) ||
      "http://www.zotero.org/styles/apa"
    );
  }

  /**
   * Get the human-readable name of the current style.
   */
  public getCurrentStyleName(): string {
    const styleID = this.getCurrentStyle();
    const style = Zotero.Styles.get(styleID);
    return style?.title || "Unknown Style";
  }

  /**
   * Generate a single citation for an item.
   */
  public generateCitation(itemID: number): string | null {
    const item = Zotero.Items.get(itemID);
    if (!item) return null;
    const citations = this.generateCitations([item]);
    return citations.length > 0 ? citations[0] : null;
  }

  /**
   * Generate formatted citations for the given items using Zotero's engine.
   */
  public generateCitations(items: Zotero.Item[]): string[] {
    if (items.length === 0) return [];

    try {
      const styleID = this.getCurrentStyle();
      const style = Zotero.Styles.get(styleID);
      if (!style) {
        throw new Error(`Citation style not found: ${styleID}`);
      }

      const cslEngine = style.getCiteProc();
      const citations: string[] = [];

      for (const item of items) {
        const citation = this.formatSingleCitation(item, cslEngine);
        if (citation) {
          citations.push(citation);
        }
      }

      return citations;
    } catch (error) {
      this.plugin.log("Citation generation failed", error);
      return items.map((item) => this.fallbackCitation(item));
    }
  }

  /**
   * Generate an in-text citation (e.g., "Smith, 2020, p. 45").
   */
  public generateInTextCitation(item: Zotero.Item, locator?: string): string {
    try {
      const styleID = this.getCurrentStyle();
      const style = Zotero.Styles.get(styleID);
      if (!style) return this.fallbackCitation(item);

      const cslEngine = style.getCiteProc();
      const citation = { id: item.id };
      const citationItems = [{ citation }];

      if (locator) {
        (citationItems[0] as any).locator = locator;
      }

      const result = cslEngine.previewCitationCluster(
        citationItems,
        [],
        [],
        "html",
      );
      return this.stripHtml(result);
    } catch (error) {
      return this.fallbackCitation(item);
    }
  }

  /**
   * Generate a bibliography entry for the given items.
   */
  public generateBibliography(items: Zotero.Item[]): string {
    if (items.length === 0) return "";

    try {
      const styleID = this.getCurrentStyle();
      const style = Zotero.Styles.get(styleID);
      if (!style) {
        return items.map((item) => this.fallbackCitation(item)).join("\n\n");
      }

      const cslEngine = style.getCiteProc();
      const citationIDs = items.map((item) => ({ id: item.id }));
      cslEngine.updateItems(citationIDs.map((c) => c.id));

      const bib = cslEngine.makeBibliography();
      if (bib && bib[1]) {
        return bib[1].join("\n");
      }

      return items.map((item) => this.fallbackCitation(item)).join("\n\n");
    } catch (error) {
      this.plugin.log("Bibliography generation failed", error);
      return items.map((item) => this.fallbackCitation(item)).join("\n\n");
    }
  }

  /**
   * Generate a formatted citation for a single item.
   */
  private formatSingleCitation(item: Zotero.Item, cslEngine: any): string {
    try {
      const citation = { id: item.id };
      const result = cslEngine.previewCitationCluster(
        [{ citation }],
        [],
        [],
        "html",
      );
      return this.stripHtml(result);
    } catch (error) {
      return this.fallbackCitation(item);
    }
  }

  /**
   * Fallback citation when CSL engine fails.
   */
  private fallbackCitation(item: Zotero.Item): string {
    const creators = item.getCreators();
    const firstCreator = creators[0];
    const author = firstCreator
      ? `${firstCreator.lastName}, ${firstCreator.firstName}`
      : "Unknown Author";
    const title = (item.getField("title") as string) || "Untitled";
    const date = (item.getField("date") as string) || "n.d.";
    return `${author} (${date}). ${title}.`;
  }

  /**
   * Strip HTML tags from citation output.
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^\u003e]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Get available citation styles.
   */
  public getAvailableStyles(): Array<{ id: string; title: string }> {
    const styles = Zotero.Styles.getAll();
    return Object.values(styles).map((style: any) => ({
      id: style.styleID,
      title: style.title,
    }));
  }
}
