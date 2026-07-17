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
  public async addPendingChange(change: PendingFileChange): Promise<boolean> {
    this.pendingChanges.set(change.id, change);
    const approved = await this.showDialog(change);
    if (!approved) {
      this.pendingChanges.delete(change.id);
    }
    return approved;
  }

  /**
   * Show approval dialog for a file change.
   * Uses createElement (not innerHTML) to avoid XUL sandbox crashes.
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

      // Clear previous content and build with createElement
      while (this.dialogElement.firstChild) {
        this.dialogElement.removeChild(this.dialogElement.firstChild);
      }

      const contentDiv = doc.createElement("div");
      contentDiv.className = "hermes-approval-content";

      const heading = doc.createElement("h3");
      heading.textContent = "📝 File Change Approval";
      contentDiv.appendChild(heading);

      const para = doc.createElement("p");
      const strong = doc.createElement("strong");
      strong.textContent = `${actionText}: `;
      para.appendChild(strong);
      const code = doc.createElement("code");
      code.textContent = change.path;
      para.appendChild(code);
      contentDiv.appendChild(para);

      const previewDiv = doc.createElement("div");
      previewDiv.className = "hermes-approval-preview";
      const pre = doc.createElement("pre");
      pre.textContent = change.newContent?.slice(0, 2000) || "(empty)";
      previewDiv.appendChild(pre);
      contentDiv.appendChild(previewDiv);

      const actionsDiv = doc.createElement("div");
      actionsDiv.className = "hermes-approval-actions";

      const approveBtn = doc.createElement("button");
      approveBtn.className = "hermes-btn-approve";
      approveBtn.textContent = "Approve";
      actionsDiv.appendChild(approveBtn);

      const denyBtn = doc.createElement("button");
      denyBtn.className = "hermes-btn-deny";
      denyBtn.textContent = "Deny";
      actionsDiv.appendChild(denyBtn);

      contentDiv.appendChild(actionsDiv);
      this.dialogElement.appendChild(contentDiv);

      const cleanup = () => {
        if (this.dialogElement) {
          this.dialogElement.remove();
          this.dialogElement = null;
        }
      };

      approveBtn.addEventListener("click", () => {
        cleanup();
        resolve(true);
      });

      denyBtn.addEventListener("click", () => {
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
