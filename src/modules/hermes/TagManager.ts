import type Addon from "../../addon";

/**
 * Manages tag operations and suggestions for Hermes Agent.
 */
export class TagManager {
  private readonly addon: Addon;
  private readonly approvalDialog?: any;

  constructor(addon: Addon, approvalDialog?: any) {
    this.addon = addon;
    this.approvalDialog = approvalDialog;
  }

  public async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
    const tags = await Zotero.Tags.getAll(Zotero.Libraries.userLibraryID);
    return tags.map((tag: any) => ({
      tag: tag.tag,
      count: tag.count || 0,
    }));
  }

  public getItemTags(itemID: number): string[] {
    const item = Zotero.Items.get(itemID);
    if (!item) return [];
    return item.getTags().map((tag: any) => tag.tag);
  }

  public async addTags(itemID: number, tags: string[]): Promise<void> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return;

    const title = (item as any).getDisplayTitle?.() || `Item ${itemID}`;
    const displayName = `Add tags to "${title}": ${tags.join(", ")}`;
    const approvalDialog =
      this.approvalDialog || (this.addon?.data?.hermes as any)?.approvalDialog;
    if (approvalDialog) {
      const changeId = `tag-add-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const approved = await approvalDialog.addPendingChange({
        action: "modify",
        id: changeId,
        newContent: `Add tags: ${tags.join(", ")}`,
        path: displayName,
        status: "pending",
        timestamp: Date.now(),
      });
      if (!approved) {
        throw new Error("Tag addition cancelled by user.");
      }
    }

    for (const tag of tags) {
      item.addTag(tag);
    }
    await item.saveTx();

    this.addon.data?.hermes?.auditLog?.record(
      "file_change",
      displayName,
      "success",
      { action: "modify", itemID, tags },
    );
  }

  public async removeTags(itemID: number, tags: string[]): Promise<void> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return;

    const title = (item as any).getDisplayTitle?.() || `Item ${itemID}`;
    const displayName = `Remove tags from "${title}": ${tags.join(", ")}`;
    const approvalDialog =
      this.approvalDialog || (this.addon?.data?.hermes as any)?.approvalDialog;
    if (approvalDialog) {
      const changeId = `tag-rm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const approved = await approvalDialog.addPendingChange({
        action: "modify",
        id: changeId,
        newContent: `Remove tags: ${tags.join(", ")}`,
        path: displayName,
        status: "pending",
        timestamp: Date.now(),
      });
      if (!approved) {
        throw new Error("Tag removal cancelled by user.");
      }
    }

    for (const tag of tags) {
      item.removeTag(tag);
    }
    await item.saveTx();

    this.addon.data?.hermes?.auditLog?.record(
      "file_change",
      displayName,
      "success",
      { action: "modify", itemID, tags },
    );
  }

  public async suggestTags(
    itemID: number,
  ): Promise<Array<{ tag: string; confidence: number }>> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return [];

    const title = (item.getField("title") as string) || "";
    const abstract = (item.getField("abstractNote") as string) || "";
    const contentText = `${title} ${abstract}`.toLowerCase();

    const allTags = await this.getAllTags();
    const existingTags = this.getItemTags(itemID);

    const suggestions: Array<{ tag: string; confidence: number }> = [];

    for (const tagObj of allTags) {
      const tag = tagObj.tag;
      if (existingTags.includes(tag)) continue;

      const tagLower = tag.toLowerCase();
      let score = 0;

      if (contentText.includes(tagLower)) {
        const escaped = this.escapeRegExp(tagLower);
        const regex = new RegExp(`\\b${escaped}\\b`, "g");
        const matches = contentText.match(regex);
        if (matches) {
          score += matches.length * 0.4;
        } else {
          score += 0.1;
        }

        const popularityBonus = Math.min(
          Math.log10(tagObj.count + 1) * 0.2,
          0.4,
        );
        score += popularityBonus;
      }

      if (score > 0) {
        suggestions.push({
          tag,
          confidence: Math.min(Math.round(score * 100) / 100, 1.0),
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Merges or renames a tag across specified items (or library-wide) with approval gating.
   */
  public async renameTag(
    oldTag: string,
    newTag: string,
    itemIDs?: number[],
  ): Promise<number> {
    if (!oldTag || !newTag || oldTag.trim() === newTag.trim()) return 0;

    const trimmedOld = oldTag.trim();
    const trimmedNew = newTag.trim();

    let itemsToProcess: Zotero.Item[] = [];
    if (itemIDs && itemIDs.length > 0) {
      const items = await Zotero.Items.getAsync(itemIDs);
      itemsToProcess = items.filter((i) => {
        if (!i || !i.isRegularItem()) return false;
        return typeof (i as any).hasTag === "function"
          ? (i as any).hasTag(trimmedOld)
          : i.getTags().some((t: any) => t.tag === trimmedOld);
      }) as Zotero.Item[];
    } else {
      const s = new Zotero.Search();
      s.addCondition("tag", "is", trimmedOld);
      const foundIDs = await s.search();
      if (foundIDs && foundIDs.length > 0) {
        itemsToProcess = (await Zotero.Items.getAsync(
          foundIDs,
        )) as Zotero.Item[];
      }
    }

    if (itemsToProcess.length === 0) {
      return 0;
    }

    const displayName = `Merge/rename tag "${trimmedOld}" → "${trimmedNew}" on ${itemsToProcess.length} item(s)`;
    const approvalDialog =
      this.approvalDialog || (this.addon?.data?.hermes as any)?.approvalDialog;
    if (approvalDialog) {
      const changeId = `tag-rename-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const approved = await approvalDialog.addPendingChange({
        action: "modify",
        id: changeId,
        newContent: `Rename tag "${trimmedOld}" to "${trimmedNew}" across ${itemsToProcess.length} item(s)`,
        path: displayName,
        status: "pending",
        timestamp: Date.now(),
      });
      if (!approved) {
        throw new Error("Tag rename cancelled by user.");
      }
    }

    let updatedCount = 0;
    for (const item of itemsToProcess) {
      try {
        item.removeTag(trimmedOld);
        item.addTag(trimmedNew);
        await item.saveTx();
        updatedCount++;
      } catch (e) {
        this.addon.log(`TagManager: Error updating item ${item.id}:`, e);
      }
    }

    this.addon.data?.hermes?.auditLog?.record(
      "file_change",
      displayName,
      "success",
      {
        action: "modify",
        oldTag: trimmedOld,
        newTag: trimmedNew,
        updatedCount,
      },
    );

    return updatedCount;
  }

  /**
   * Detects duplicate casing, formatting variants, and hierarchical structures in tags.
   */
  public detectTaxonomyClusters(tags: string[]): {
    duplicates: Array<{ canonical: string; variants: string[] }>;
    hierarchical: Array<{ category: string; tags: string[] }>;
  } {
    const normMap = new Map<string, string[]>();

    for (const tag of tags) {
      const key = tag.toLowerCase().replace(/[-_\s]+/g, "");
      if (!normMap.has(key)) {
        normMap.set(key, []);
      }
      normMap.get(key)!.push(tag);
    }

    const duplicates: Array<{ canonical: string; variants: string[] }> = [];
    for (const [, variants] of normMap) {
      const uniqueVariants = Array.from(new Set(variants));
      if (uniqueVariants.length > 1) {
        // Use the shortest or most cleanly formatted variant as canonical
        const canonical = uniqueVariants.reduce((best, cur) =>
          cur.length <= best.length ? cur : best,
        );
        duplicates.push({
          canonical,
          variants: uniqueVariants,
        });
      }
    }

    const hierMap = new Map<string, string[]>();
    for (const tag of tags) {
      if (tag.includes("/")) {
        const parts = tag.split("/");
        const cat = parts[0].trim();
        const sub = parts.slice(1).join("/").trim();
        if (!hierMap.has(cat)) {
          hierMap.set(cat, []);
        }
        if (sub) {
          hierMap.get(cat)!.push(sub);
        }
      }
    }

    const hierarchical: Array<{ category: string; tags: string[] }> = [];
    for (const [category, subTags] of hierMap) {
      hierarchical.push({ category, tags: Array.from(new Set(subTags)) });
    }

    return { duplicates, hierarchical };
  }
}
