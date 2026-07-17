import type Addon from "../../addon";

/**
 * Manages citation generation using Zotero's configured citation style.
 */
export class CitationManager {
  private readonly addon: Addon;

  constructor(addon: Addon) {
    this.addon = addon;
  }

  public getCurrentStyle(): string {
    return (
      (Zotero.Prefs.get("export.lastStyle") as string) ||
      "http://www.zotero.org/styles/apa"
    );
  }

  public getCurrentStyleName(): string {
    const styleID = this.getCurrentStyle();
    const style = Zotero.Styles.get(styleID);
    return style?.title || "Unknown Style";
  }

  public generateCitation(itemID: number): string | null {
    const item = Zotero.Items.get(itemID);
    if (!item) return null;
    const citations = this.generateCitations([item]);
    return citations.length > 0 ? citations[0] : null;
  }

  public generateCitations(items: Zotero.Item[]): string[] {
    if (items.length === 0) return [];
    try {
      const styleID = this.getCurrentStyle();
      const style = Zotero.Styles.get(styleID);
      if (!style) {
        throw new Error(`Citation style not found: ${styleID}`);
      }
      const cslEngine = style.getCiteProc();
      const itemIDs = items.map((item) => item.id);
      cslEngine.updateItems(itemIDs);
      const citation = { citationItems: itemIDs.map((id) => ({ id })) };
      const result = cslEngine.appendCitationCluster(citation, true);
      return result.map((r: any) => r[1]);
    } catch (error) {
      this.addon.log("Citation generation failed:", error);
      return [];
    }
  }

  public generateBibliography(items: Zotero.Item[]): string | null {
    if (items.length === 0) return null;
    try {
      const styleID = this.getCurrentStyle();
      return this.generateBibliographyWithStyle(items, styleID);
    } catch (error) {
      this.addon.log("Bibliography generation failed:", error);
      return null;
    }
  }

  public getStyleByIDOrName(name: string): string | null {
    const query = name.toLowerCase().trim();
    if (!query) return null;

    if (Zotero.Styles.get(query)) {
      return query;
    }

    const styles = Zotero.Styles.getVisible();
    for (const style of styles) {
      if (
        style.title.toLowerCase() === query ||
        (style.shortTitle && style.shortTitle.toLowerCase() === query)
      ) {
        return style.styleID;
      }
    }

    for (const style of styles) {
      if (
        style.title.toLowerCase().includes(query) ||
        (style.shortTitle && style.shortTitle.toLowerCase().includes(query))
      ) {
        return style.styleID;
      }
    }

    return null;
  }

  public generateCitationWithStyle(
    itemID: number,
    styleID: string,
  ): string | null {
    try {
      const item = Zotero.Items.get(itemID);
      if (!item) return null;
      const style = Zotero.Styles.get(styleID);
      if (!style) {
        throw new Error(`Style not found: ${styleID}`);
      }
      const cslEngine = style.getCiteProc();
      cslEngine.updateItems([item.id]);
      const citation = { citationItems: [{ id: item.id }] };
      const result = cslEngine.appendCitationCluster(citation, true);
      return result.length > 0 ? result[0][1] : null;
    } catch (error) {
      this.addon.log(`Citation generation failed for style ${styleID}:`, error);
      return null;
    }
  }

  public generateBibliographyWithStyle(
    items: Zotero.Item[],
    styleID: string,
  ): string | null {
    if (items.length === 0) return null;
    try {
      const style = Zotero.Styles.get(styleID);
      if (!style) {
        throw new Error(`Style not found: ${styleID}`);
      }
      const cslEngine = style.getCiteProc();
      cslEngine.updateItems(items.map((item) => item.id));
      const bib = cslEngine.makeBibliography();
      return bib?.[1]?.join("\n") || null;
    } catch (error) {
      this.addon.log(
        `Bibliography generation failed for style ${styleID}:`,
        error,
      );
      return null;
    }
  }
}
