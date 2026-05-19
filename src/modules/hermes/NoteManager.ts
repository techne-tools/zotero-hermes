/**
 * Manages Zotero note operations for Hermes Agent.
 */
export class NoteManager {
  private readonly plugin: any;
  private readonly approvalDialog: any;

  constructor(plugin: any, approvalDialog?: any) {
    this.plugin = plugin;
    this.approvalDialog = approvalDialog;
  }

  /**
   * Read a note's content.
   */
  public async readNote(noteID: number): Promise<string | null> {
    const note = await Zotero.Items.getAsync(noteID);
    if (!note || note.itemType !== "note") {
      return null;
    }
    return note.getNote();
  }

  /**
   * Create or update a note with approval system.
   */
  public async writeNote(
    noteID: number | null,
    content: string,
    title?: string,
    parentItemID?: number,
    contextItemIDs?: number[],
  ): Promise<number> {
    let note: Zotero.Item;

    if (noteID) {
      // Update existing note
      note = await Zotero.Items.getAsync(noteID);
      if (!note || note.itemType !== "note") {
        throw new Error("Invalid note ID");
      }

      // Check if content is different
      const currentContent = note.getNote();
      if (currentContent === content) {
        return note.id;
      }

      // Show approval dialog if available
      if (this.approvalDialog) {
        const result = await this.approvalDialog.showNoteApproval(
          "Approve Note Changes",
          currentContent,
          content,
          title || note.getDisplayTitle(),
        );

        if (result === "reject") {
          throw new Error("User rejected note changes");
        }

        if (result === "modify") {
          // Open note editor for manual modification
          await this.openNoteEditor(noteID);
          return note.id;
        }
      }

      note.setNote(content);
    } else {
      // Create new note
      note = new Zotero.Item("note");
      (note as any).libraryID = Zotero.Libraries.userLibraryID;
      note.setNote(content);
      if (parentItemID) {
        note.parentID = parentItemID;
      }
    }

    // Link context items as "Related" items in Zotero's database
    if (contextItemIDs && contextItemIDs.length > 0) {
      for (const itemID of contextItemIDs) {
        const relatedItem = await Zotero.Items.getAsync(itemID);
        if (relatedItem) {
          note.addRelatedItem(relatedItem);
        }
      }
    }

    await note.saveTx();
    return note.id;
  }

  /**
   * Get all notes in the library.
   */
  public async getAllNotes(): Promise<Zotero.Item[]> {
    const notes = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID);
    return notes.filter((note) => note.itemType === "note");
  }

  /**
   * Search notes by query.
   */
  public async searchNotes(query: string): Promise<Zotero.Item[]> {
    // Use Zotero's native search engine to avoid loading all notes into memory
    const search = new Zotero.Search();
    search.addCondition("itemType", "is", "note");
    search.addCondition("quicksearch-everything", "contains", query);

    const itemIDs = await search.search();
    if (!itemIDs || itemIDs.length === 0) {
      return [];
    }

    return (await Zotero.Items.getAsync(itemIDs)) as Zotero.Item[];
  }

  /**
   * Get note by item attachment.
   */
  public async getNoteByParent(
    parentItemID: number,
  ): Promise<Zotero.Item | null> {
    const parentItem = await Zotero.Items.getAsync(parentItemID);
    if (!parentItem) {
      return null;
    }

    const notes = parentItem.getNotes();
    if (notes.length === 0) {
      return null;
    }

    return Zotero.Items.get(notes[0]);
  }

  /**
   * Open note in Zotero's note editor.
   */
  public async openNoteEditor(noteID: number): Promise<void> {
    try {
      const note = await Zotero.Items.getAsync(noteID);
      if (!note) return;

      // Open in note editor
      const win = Zotero.getMainWindow();
      if (win && (win as any).ZoteroPane) {
        (win as any).ZoteroPane.openNoteEditor(noteID);
      }
    } catch (error) {
      this.plugin.log("Error opening note editor", error);
    }
  }

  /**
   * Append content to an existing note with approval.
   */
  public async appendToNote(
    noteID: number,
    contentToAppend: string,
    title?: string,
    contextItemIDs?: number[],
  ): Promise<number> {
    const note = await Zotero.Items.getAsync(noteID);
    if (!note || note.itemType !== "note") {
      throw new Error("Invalid note ID");
    }

    const currentContent = note.getNote() || "";
    const newContent = currentContent + "\n\n" + contentToAppend;

    return await this.writeNote(
      noteID,
      newContent,
      title,
      undefined,
      contextItemIDs,
    );
  }

  /**
   * Format note content for prompt context.
   */
  public formatNoteForPrompt(
    note: Zotero.Item,
  ): { type: string; content: string } | null {
    if (!note || note.itemType !== "note") return null;

    const title = note.getDisplayTitle() || "Untitled Note";
    const content = note.getNote() || "";

    return {
      type: "note",
      content: `Note: ${title}\n${content}`,
    };
  }
}
