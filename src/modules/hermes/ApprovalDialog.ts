import type Addon from "../../addon";
import type { PendingFileChange } from "./types";

/**
 * Approval dialog for file modifications suggested by Hermes Agent.
 * Intercepts file write/delete operations and requires user approval.
 */
export class ApprovalDialog {
  private readonly addon: Addon;
  private pendingChanges = new Map<string, PendingFileChange>();
  private dialogElement: HTMLDialogElement | null = null;

  constructor(addon: Addon) {
    this.addon = addon;
  }

  /**
   * Add a pending file change and show approval dialog.
   */
  public async addPendingChange(
    change: PendingFileChange,
  ): Promise<boolean> {
    this.pendingChanges.set(change.id, change);
    const approved = await this.showDialog(change);
    if (!approved) {
      this.pendingChanges.delete(change.id);
    }
    return approved;
  }

  /**
   * Show approval dialog for a file change.
   */
  private async showDialog(change: PendingFileChange): Promise<boolean> {
    return new Promise((resolve) => {
      const doc = Zotero.getMainWindow().document;
      
      // Create dialog if it doesn't exist
      if (!this.dialogElement) {
        this.dialogElement = doc.createElement("dialog");
        this.dialogElement.className = "hermes-approval-dialog";
        doc.documentElement?.appendChild(this.dialogElement);
      }

      const actionText =
        change.action === "create"
          ? "Create"
          : change.action === "delete"
            ? "Delete"
            : "Modify";

      this.dialogElement.innerHTML = `
        <div class="hermes-approval-content">
          <h3>📝 File Change Approval</h3>
          <p><strong>${actionText}:</strong> <code>${change.path}</code></p>
          <div class="hermes-approval-preview">
            <pre>${change.newContent?.slice(0, 2000) || "(empty)"}</pre>
          </div>
          <div class="hermes-approval-actions">
            <button class="hermes-btn-approve">Approve</button>
            <button class="hermes-btn-deny">Deny</button>
          </div>
        </div>
      `;

      const approveBtn = this.dialogElement.querySelector(
        ".hermes-btn-approve",
      ) as HTMLButtonElement;
      const denyBtn = this.dialogElement.querySelector(
        ".hermes-btn-deny",
      ) as HTMLButtonElement;

      const cleanup = () => {
        if (this.dialogElement) {
          this.dialogElement.remove();
          this.dialogElement = null;
        }
      };

      approveBtn?.addEventListener("click", () => {
        cleanup();
        resolve(true);
      });

      denyBtn?.addEventListener("click", () => {
        cleanup();
        resolve(false);
      });

      this.dialogElement.showModal();
    });
  }

  /**
   * Get a pending file change by ID.
   */
  public getPendingChange(id: string): PendingFileChange | undefined {
    return this.pendingChanges.get(id);
  }

  /**
   * Get all pending changes.
   */
  public getPendingChanges(): PendingFileChange[] {
    return Array.from(this.pendingChanges.values());
  }

  /**
   * Approve all pending changes.
   */
  public async approveAll(): Promise<number> {
    const pending = this.getPendingChanges();
    let approved = 0;
    for (const change of pending) {
      if (change.status === "pending") {
        change.status = "approved";
        approved++;
      }
    }
    return approved;
  }

  /**
   * Get count of pending changes.
   */
  public getPendingCount(): number {
    let count = 0;
    for (const change of this.pendingChanges.values()) {
      if (change.status === "pending") count++;
    }
    return count;
  }

  /**
   * Clear all pending changes.
   */
  public clearPendingChanges(): void {
    this.pendingChanges.clear();
  }
}
