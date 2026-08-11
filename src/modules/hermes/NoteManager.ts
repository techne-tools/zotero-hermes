import type Addon from "../../addon";

/**
 * Manages Zotero note operations for Hermes Agent.
 */
export class NoteManager {
  private readonly addon: Addon;
  private readonly approvalDialog: any;

  constructor(addon: Addon, approvalDialog?: any) {
    this.addon = addon;
    this.approvalDialog = approvalDialog;
  }

  public async readNote(noteID: number): Promise<string | null> {
    const note = await Zotero.Items.getAsync(noteID);
    if (!note || note.itemType !== "note") {
      return null;
    }
    return note.getNote();
  }

  public async writeNote(
    noteID: number | null,
    content: string,
    title?: string,
    parentItemID?: number,
  ): Promise<number> {
    const isNew = !noteID;

    // Resolve details for the approval dialog
    let parentTitle = "Standalone Note";
    if (parentItemID) {
      try {
        const parentItem = await Zotero.Items.getAsync(parentItemID);
        if (parentItem) {
          parentTitle = parentItem.getDisplayTitle();
        }
      } catch (err) {
        this.addon.log(
          `NoteManager: failed to get parent item ${parentItemID}`,
          err,
        );
      }
    }
    const displayName = title
      ? `"${title}" under "${parentTitle}"`
      : `Note under "${parentTitle}"`;

    if (this.approvalDialog) {
      const changeId = `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const approved = await this.approvalDialog.addPendingChange({
        action: isNew ? "create" : "modify",
        id: changeId,
        newContent: content,
        path: displayName,
        status: "pending",
        timestamp: Date.now(),
      });
      if (!approved) {
        throw new Error("Note creation cancelled by user.");
      }
    }

    let note: Zotero.Item;
    if (noteID) {
      note = await Zotero.Items.getAsync(noteID);
      if (!note || note.itemType !== "note") {
        throw new Error(`Note with ID ${noteID} not found`);
      }
    } else {
      note = new Zotero.Item("note");
      let libraryID = Zotero.Libraries.userLibraryID;
      if (parentItemID) {
        try {
          const parentItem = await Zotero.Items.getAsync(parentItemID);
          if (parentItem) {
            libraryID = parentItem.libraryID;
            note.parentItemID = parentItemID;
          }
        } catch (err) {
          this.addon.log(
            `NoteManager: failed to resolve parent item library ${parentItemID}`,
            err,
          );
        }
      }
      note.libraryID = libraryID;
    }

    // Format content: Zotero notes are HTML/rich text. We can prefix with a title header if specified.
    // The title is escaped before interpolation to prevent HTML injection.
    let noteContent = content;
    if (title) {
      const escapedTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      if (
        !content.includes(`<h1>${escapedTitle}</h1>`) &&
        !content.includes(`<h2>${escapedTitle}</h2>`)
      ) {
        noteContent = `<h1>${escapedTitle}</h1>\n${content}`;
      }
    }

    note.setNote(noteContent);
    await note.saveTx();
    return note.id;
  }

  public async searchNotes(query: string): Promise<Zotero.Item[]> {
    const s = new Zotero.Search();
    s.addCondition("itemType", "is", "note");
    const ids = await s.search();
    if (!ids || ids.length === 0) return [];
    const notes = await Zotero.Items.getAsync(ids);

    if (!query) return notes;

    const queryLower = query.toLowerCase();
    const scoredNotes = notes.map((note) => {
      const noteText = (note.getNote() || "").toLowerCase();
      let score = 0;

      // Substring match
      if (noteText.includes(queryLower)) {
        score += 100;
      }

      // Word match scoring
      const queryWords = queryLower.split(/\s+/).filter(Boolean);
      let matchCount = 0;
      for (const word of queryWords) {
        if (noteText.includes(word)) {
          score += 10;
          matchCount++;
        }
      }
      if (matchCount === queryWords.length) {
        score += 20;
      }

      return { note, score };
    });

    return scoredNotes
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.note);
  }
}
