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

  public async suggestTags(_itemID: number): Promise<string[]> {
    // TODO: Implement AI-powered tag suggestions
    return [];
  }
}
