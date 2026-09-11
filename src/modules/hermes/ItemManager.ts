import type Addon from "../../addon";

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
  storagePath?: string;
  attachmentKey?: string;
}

/**
 * Manages Zotero item context extraction for Hermes Agent.
 */
export class ItemManager {
  private readonly addon: Addon;
  private attachedItems: AttachedItem[] = [];

  constructor(addon: Addon) {
    this.addon = addon;
  }

  public getSelectedItems(): Zotero.Item[] {
    const zoteroPane = Zotero.getActiveZoteroPane();
    if (!zoteroPane) return [];
    return zoteroPane.getSelectedItems() || [];
  }

  public async attachSelectedItems(): Promise<AttachedItem[]> {
    const items = this.getSelectedItems();
    const attached: AttachedItem[] = [];
    for (const item of items) {
      const attachedItem = await this.extractItemData(item);
      if (attachedItem) {
        this.attachedItems.push(attachedItem);
        attached.push(attachedItem);
      }
    }
    return attached;
  }

  public async extractItemData(
    item: Zotero.Item,
  ): Promise<AttachedItem | null> {
    try {
      // Resolve the best attachment's storage path.
      // getBestAttachment() is async in Zotero's API — must be awaited.
      let storagePath: string | undefined;
      let attachmentKey: string | undefined;
      try {
        const bestAttachment = (await (item as any).getBestAttachment?.()) as
          | Zotero.Item
          | false
          | undefined;
        if (bestAttachment) {
          attachmentKey = bestAttachment.key;
          const file = (bestAttachment as any).getFilePath?.() as
            | string
            | undefined;
          if (file) {
            storagePath = file;
          }
        }
      } catch {
        // ignore attachment resolution errors
      }

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
        storagePath,
        attachmentKey,
      };
    } catch {
      return null;
    }
  }

  /**
   * Attach a single item (used by the add-context: link handler and the
   * slash-command flow). Extracts metadata and records it in attachedItems
   * so slash commands (/annotations, /cite, /tag, /savechat) can find it.
   */
  public async attachItem(item: Zotero.Item): Promise<AttachedItem | null> {
    const attachedItem = await this.extractItemData(item);
    if (attachedItem) {
      this.addAttachedItem(attachedItem);
    }
    return attachedItem;
  }

  /**
   * Record an already-extracted AttachedItem, deduping by item id.
   */
  public addAttachedItem(attachedItem: AttachedItem): void {
    if (!this.attachedItems.some((a) => a.id === attachedItem.id)) {
      this.attachedItems.push(attachedItem);
    }
  }

  /**
   * Remove an item from attachedItems by item ID or key.
   */
  public removeAttachedItem(idOrKey: number | string): void {
    this.attachedItems = this.attachedItems.filter((item) => {
      if (typeof idOrKey === "number") {
        return item.id !== idOrKey;
      }
      return item.key !== idOrKey && String(item.id) !== idOrKey;
    });
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
