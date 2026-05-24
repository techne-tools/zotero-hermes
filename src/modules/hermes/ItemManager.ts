export interface AttachedItem {
  id: number;
  key: string;
  title: string;
  itemType: string;
  creators: string[];
  date: string;
  abstract: string;
  tags: string[];
  url?: string;
  doi?: string;
}

/**
 * Manages Zotero item context extraction for Hermes Agent.
 */
export class ItemManager {
  private readonly addon: any;
  private attachedItems: AttachedItem[] = [];

  constructor(addon: any) {
    this.addon = addon;
  }

  public getSelectedItems(): Zotero.Item[] {
    const zoteroPane = Zotero.getActiveZoteroPane();
    if (!zoteroPane) return [];
    return zoteroPane.getSelectedItems() || [];
  }

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

  public extractItemData(item: Zotero.Item): AttachedItem | null {
    try {
      return {
        id: item.id,
        key: item.key,
        title: (item.getField("title") as string) || "Untitled",
        itemType: item.itemType,
        creators: this.formatCreators(item),
        date: (item.getField("date") as string) || "",
        abstract: (item.getField("abstractNote") as string) || "",
        tags: item.getTags().map((t: any) => t.tag),
        url: (item.getField("url") as string) || undefined,
        doi: (item.getField("DOI") as string) || undefined,
      };
    } catch {
      return null;
    }
  }

  public clearAttachedItems(): void {
    this.attachedItems = [];
  }

  public getAttachedItems(): AttachedItem[] {
    return [...this.attachedItems];
  }

  private formatCreators(item: Zotero.Item): string[] {
    const creators = item.getCreators();
    return creators.map((c: any) => {
      if (c.firstName && c.lastName) {
        return `${c.firstName} ${c.lastName}`;
      }
      return c.name || "";
    });
  }
}
