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

  /**
   * Update metadata fields on a Zotero library item.
   * Gated through ApprovalDialog for user confirmation and recorded in AuditLog.
   */
  public async updateItemMetadata(
    itemID: number,
    updates: Record<string, any>,
  ): Promise<boolean> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) {
      throw new Error(`Item with ID ${itemID} not found.`);
    }

    const PROTECTED_FIELDS = new Set([
      "id",
      "key",
      "libraryID",
      "version",
      "itemTypeID",
      "itemType",
      "dateAdded",
      "dateModified",
      "deleted",
    ]);

    const FIELD_ALIASES: Record<string, string> = {
      abstract: "abstractNote",
      doi: "DOI",
      publication: "publicationTitle",
      journal: "publicationTitle",
      isbn: "ISBN",
      issn: "ISSN",
    };

    const cleanUpdates: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      const field = FIELD_ALIASES[key.toLowerCase()] || key;
      if (!PROTECTED_FIELDS.has(field) && !PROTECTED_FIELDS.has(key)) {
        cleanUpdates[field] = val;
      }
    }

    if (Object.keys(cleanUpdates).length === 0) {
      return false;
    }

    // Build diff for approval dialog
    const diffLines: string[] = [];
    for (const [field, newVal] of Object.entries(cleanUpdates)) {
      if (field === "creators") {
        const oldCreators = this.formatCreators(item).join(", ") || "(none)";
        const newCreatorsStr = Array.isArray(newVal)
          ? newVal
              .map((c) =>
                typeof c === "string"
                  ? c
                  : c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
              )
              .join(", ")
          : String(newVal);
        diffLines.push(`Creators: "${oldCreators}" -> "${newCreatorsStr}"`);
      } else {
        const oldVal = (item.getField(field as any) as string) || "(empty)";
        diffLines.push(`${field}: "${oldVal}" -> "${newVal}"`);
      }
    }

    const displayName = (item as any).getDisplayTitle?.() || `Item ${itemID}`;
    const approvalDialog = (this.addon.data?.hermes as any)?.approvalDialog;
    if (approvalDialog) {
      const changeId = `meta-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const approved = await approvalDialog.addPendingChange({
        action: "modify",
        id: changeId,
        newContent: diffLines.join("\n"),
        path: `Metadata for "${displayName}"`,
        status: "pending",
        timestamp: Date.now(),
      });
      if (!approved) {
        throw new Error("Metadata update cancelled by user.");
      }
    }

    // Apply updates
    for (const [field, val] of Object.entries(cleanUpdates)) {
      if (field === "creators") {
        if (Array.isArray(val)) {
          const parsedCreators = val.map((c) => {
            if (typeof c === "object" && c !== null) {
              return {
                creatorType: (c as any).creatorType || "author",
                ...c,
              };
            }
            const str = String(c).trim();
            const parts = str.split(/\s+/);
            if (parts.length === 1) {
              return {
                lastName: parts[0],
                firstName: "",
                creatorType: "author",
              };
            }
            const lastName = parts.pop()!;
            const firstName = parts.join(" ");
            return { firstName, lastName, creatorType: "author" };
          });
          item.setCreators(parsedCreators);
        }
      } else {
        item.setField(field as any, String(val));
      }
    }

    await item.saveTx();

    // Update in-memory attached items if present
    const existingIndex = this.attachedItems.findIndex((a) => a.id === itemID);
    if (existingIndex !== -1) {
      const updated = await this.extractItemData(item);
      if (updated) {
        this.attachedItems[existingIndex] = updated;
      }
    }

    this.addon.data?.hermes?.auditLog?.record(
      "file_change",
      `Update metadata for "${displayName}"`,
      "success",
      { itemID, fields: Object.keys(cleanUpdates) },
    );

    return true;
  }
}
