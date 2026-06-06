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
    // TODO: Implement with approval system
    return noteID || 0;
  }

  public async searchNotes(query: string): Promise<Zotero.Item[]> {
    // TODO: Implement fuzzy search
    return [];
  }
}
