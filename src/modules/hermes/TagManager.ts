import type Addon from "../../addon";

/**
 * Manages tag operations and suggestions for Hermes Agent.
 */
export class TagManager {
  private readonly addon: Addon;

  constructor(addon: Addon) {
    this.addon = addon;
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
    for (const tag of tags) {
      item.addTag(tag);
    }
    await item.saveTx();
  }

  public async removeTags(itemID: number, tags: string[]): Promise<void> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return;
    for (const tag of tags) {
      item.removeTag(tag);
    }
    await item.saveTx();
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
}
