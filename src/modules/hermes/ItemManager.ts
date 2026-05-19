/**
 * Manages Zotero item context extraction for Hermes Agent.
 */
export class ItemManager {
  private readonly plugin: any;
  private attachedItems: AttachedItem[] = [];

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  /**
   * Get currently selected Zotero items.
   */
  public getSelectedItems(): Zotero.Item[] {
    const zoteroPane = Zotero.getActiveZoteroPane();
    if (!zoteroPane) return [];
    return zoteroPane.getSelectedItems() || [];
  }

  /**
   * Attach selected items to the current chat context.
   */
  public attachSelectedItems(): AttachedItem[] {
    const items = this.getSelectedItems();
    const attached: AttachedItem[] = [];

    for (const item of items) {
      const attachedItem = this.extractItemData(item);
      if (attachedItem) {
        this.attachedItems.push(attachedItem);
        attached.push(attachedItem);
      }
    }

    return attached;
  }

  /**
   * Extract relevant metadata from a Zotero item.
   */
  public extractItemData(item: Zotero.Item): AttachedItem | null {
    try {
      const data: AttachedItem = {
        id: item.id,
        key: item.key,
        title: (item.getField("title") as string) || "Untitled",
        itemType: item.itemType,
        creators: this.formatCreators(item),
        date: (item.getField("date") as string) || "",
        abstract: (item.getField("abstractNote") as string) || "",
        tags: item.getTags().map((tag: { tag: string }) => tag.tag),
        url: (item.getField("url") as string) || "",
        DOI: (item.getField("DOI") as string) || "",
        extra: (item.getField("extra") as string) || "",
      };

      return data;
    } catch (error) {
      this.plugin.log("Failed to extract item data", error);
      return null;
    }
  }

  /**
   * Format creators as a readable string.
   */
  private formatCreators(item: Zotero.Item): string[] {
    const creators = item.getCreators();
    return creators.map((creator: any) => {
      const firstName = creator.firstName || "";
      const lastName = creator.lastName || "";
      const name = `${firstName} ${lastName}`.trim();
      return name || "Unknown";
    });
  }

  /**
   * Get all attached items.
   */
  public getAttachedItems(): AttachedItem[] {
    return [...this.attachedItems];
  }

  /**
   * Clear attached items.
   */
  public clearAttachedItems(): void {
    this.attachedItems = [];
  }

  /**
   * Remove a specific attached item.
   */
  public removeAttachedItem(id: number): void {
    this.attachedItems = this.attachedItems.filter((item) => item.id !== id);
  }

  /**
   * Format attached items as context for Hermes prompt.
   */
  public formatContextForPrompt(): Array<{ type: string; content: string }> {
    return this.attachedItems.map((item) => ({
      type: "zotero_item",
      content: this.formatItemAsText(item),
    }));
  }

  /**
   * Format a single item as readable text.
   */
  private formatItemAsText(item: AttachedItem): string {
    const parts = [
      `Title: ${item.title}`,
      `Type: ${item.itemType}`,
      item.creators.length > 0 ? `Authors: ${item.creators.join(", ")}` : "",
      item.date ? `Date: ${item.date}` : "",
      item.DOI ? `DOI: ${item.DOI}` : "",
      item.url ? `URL: ${item.url}` : "",
      item.tags.length > 0 ? `Tags: ${item.tags.join(", ")}` : "",
      item.abstract ? `Abstract: ${item.abstract}` : "",
      item.extra ? `Extra: ${item.extra}` : "",
    ];

    return parts.filter(Boolean).join("\n");
  }

  /**
   * Get item count summary.
   */
  public getItemSummary(): string {
    const count = this.attachedItems.length;
    if (count === 0) return "";
    if (count === 1) return this.attachedItems[0].title;
    return `${count} items attached`;
  }
}

export interface AttachedItem {
  id: number;
  key: string;
  title: string;
  itemType: string;
  creators: string[];
  date: string;
  abstract: string;
  tags: string[];
  url: string;
  DOI: string;
  extra: string;
}
