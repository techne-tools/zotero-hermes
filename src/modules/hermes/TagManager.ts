/**
 * Manages tag operations and suggestions for Hermes Agent.
 */
export class TagManager {
  private readonly plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  /**
   * Get all tags in the library.
   */
  public async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
    const tags = await Zotero.Tags.getAll(Zotero.Libraries.userLibraryID);
    return tags.map((tag: any) => ({
      tag: tag.tag,
      count: tag.count || 0,
    }));
  }

  /**
   * Get tags for a specific item.
   */
  public getItemTags(itemID: number): string[] {
    const item = Zotero.Items.get(itemID);
    if (!item) return [];
    return item.getTags().map((tag: any) => tag.tag);
  }

  /**
   * Add tags to an item.
   */
  public async addTags(itemID: number, tags: string[]): Promise<void> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return;

    for (const tag of tags) {
      item.addTag(tag);
    }
    await item.saveTx();
  }

  /**
   * Remove tags from an item.
   */
  public async removeTags(itemID: number, tags: string[]): Promise<void> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return;

    for (const tag of tags) {
      item.removeTag(tag);
    }
    await item.saveTx();
  }

  /**
   * Suggest tags for an item based on its metadata.
   */
  public async suggestTags(itemID: number): Promise<TagSuggestion[]> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return [];

    const suggestions: TagSuggestion[] = [];
    const existingTags = new Set(this.getItemTags(itemID));

    // Get item metadata for analysis
    const title = item.getDisplayTitle() || "";
    const abstract = (item.getField("abstractNote") as string) || "";
    const text = `${title} ${abstract}`.toLowerCase();

    // Get all library tags for matching
    const allTags = await this.getAllTags();

    // Simple keyword matching for suggestions
    for (const { tag } of allTags) {
      if (existingTags.has(tag)) continue;

      const lowerTag = tag.toLowerCase();
      if (text.includes(lowerTag)) {
        suggestions.push({
          tag,
          confidence: this.calculateConfidence(text, lowerTag),
          reason: "Keyword match in title/abstract",
        });
      }
    }

    // Sort by confidence
    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  /**
   * Get tag suggestions for multiple items.
   */
  public async suggestTagsForItems(
    itemIDs: number[],
  ): Promise<Record<number, TagSuggestion[]>> {
    const result: Record<number, TagSuggestion[]> = {};
    for (const itemID of itemIDs) {
      result[itemID] = await this.suggestTags(itemID);
    }
    return result;
  }

  /**
   * Format tag suggestions for prompt context.
   */
  public formatTagSuggestionsForPrompt(
    itemID: number,
    suggestions: TagSuggestion[],
  ): { type: string; content: string } | null {
    if (suggestions.length === 0) return null;

    const item = Zotero.Items.get(itemID);
    if (!item) return null;

    const title = item.getDisplayTitle() || "Untitled";
    const lines = suggestions.map(
      (s) =>
        `- "${s.tag}" (${Math.round(s.confidence * 100)}% confidence) - ${s.reason}`,
    );

    return {
      type: "tag_suggestions",
      content: `Tag suggestions for "${title}":\n${lines.join("\n")}`,
    };
  }

  /**
   * Calculate confidence score for a tag match.
   */
  private calculateConfidence(text: string, tag: string): number {
    const occurrences = (text.match(new RegExp(tag, "g")) || []).length;
    const tagLength = tag.length;
    const textLength = text.length;

    // Simple confidence calculation
    let confidence = Math.min(occurrences * 0.2, 0.8);

    // Boost for longer tags (more specific)
    if (tagLength > 8) confidence += 0.1;

    // Boost for exact word matches
    const wordRegex = new RegExp(`\\b${tag}\\b`, "g");
    const wordMatches = (text.match(wordRegex) || []).length;
    if (wordMatches > 0) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * Get popular tags (most used in library).
   */
  public async getPopularTags(
    limit: number = 20,
  ): Promise<Array<{ tag: string; count: number }>> {
    const tags = await this.getAllTags();
    return tags.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  /**
   * Search tags by query.
   */
  public async searchTags(
    query: string,
  ): Promise<Array<{ tag: string; count: number }>> {
    const tags = await this.getAllTags();
    const lowerQuery = query.toLowerCase();
    return tags.filter((t) => t.tag.toLowerCase().includes(lowerQuery));
  }
}

export interface TagSuggestion {
  tag: string;
  confidence: number;
  reason: string;
}
