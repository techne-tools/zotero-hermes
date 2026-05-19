/**
 * Approval dialog for note modifications suggested by Hermes Agent.
 */
export class ApprovalDialog {
  private readonly plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  /**
   * Show approval dialog for note content changes.
   * Returns true if approved, false if rejected.
   */
  public async showNoteApproval(
    title: string,
    currentContent: string,
    proposedContent: string,
    noteTitle?: string,
  ): Promise<"approve" | "reject" | "modify"> {
    return new Promise((resolve) => {
      const diff = this.generateDiff(currentContent, proposedContent);

      const dialogData = {
        title: `Approve Changes: ${noteTitle || "Note"}`,
        _lastButtonId: "",
        unloadLock: Zotero.Promise.defer(),
      };

      const dialog = new ztoolkit.Dialog(5, 1)
        .addCell(0, 0, {
          tag: "h2",
          namespace: "html",
          properties: {
            innerHTML: dialogData.title,
          },
        })
        .addCell(1, 0, {
          tag: "p",
          namespace: "html",
          properties: {
            innerHTML: "Hermes suggests the following changes:",
          },
        })
        .addCell(2, 0, {
          tag: "div",
          namespace: "html",
          properties: {
            innerHTML: diff,
          },
          styles: {
            maxHeight: "400px",
            overflowY: "auto",
            border: "1px solid #ccc",
            padding: "8px",
            fontFamily: "monospace",
            fontSize: "0.9em",
            background: "#fafafa",
          },
        })
        .addCell(3, 0, {
          tag: "p",
          namespace: "html",
          properties: {
            innerHTML: "Do you want to apply these changes?",
          },
        })
        .addButton("Approve", "approve")
        .addButton("Modify", "modify")
        .addButton("Reject", "reject")
        .setDialogData(dialogData)
        .open("dialog");

      // Wait for dialog to close
      dialogData.unloadLock.promise.then(() => {
        const result = dialogData._lastButtonId as
          | "approve"
          | "reject"
          | "modify";
        resolve(result || "reject");
      });
    });
  }

  /**
   * Show approval dialog for annotation creation.
   */
  public async showAnnotationApproval(
    itemTitle: string,
    annotationType: string,
    text: string,
    comment: string,
    page: number,
  ): Promise<"approve" | "reject"> {
    return new Promise((resolve) => {
      const dialogData = {
        _lastButtonId: "",
        unloadLock: Zotero.Promise.defer(),
      };

      const dialog = new ztoolkit.Dialog(6, 1)
        .addCell(0, 0, {
          tag: "h2",
          namespace: "html",
          properties: {
            innerHTML: "Approve Annotation",
          },
        })
        .addCell(1, 0, {
          tag: "p",
          namespace: "html",
          properties: {
            innerHTML: `Hermes suggests creating an annotation on: <strong>${this.escapeHtml(itemTitle)}</strong>`,
          },
        })
        .addCell(2, 0, {
          tag: "p",
          namespace: "html",
          properties: {
            innerHTML: `Type: ${annotationType} | Page: ${page}`,
          },
        })
        .addCell(3, 0, {
          tag: "p",
          namespace: "html",
          properties: {
            innerHTML: "<strong>Text:</strong>",
          },
        })
        .addCell(4, 0, {
          tag: "div",
          namespace: "html",
          properties: {
            innerHTML: this.escapeHtml(text),
          },
          styles: {
            border: "1px solid #ccc",
            padding: "8px",
            background: "#f5f5f5",
          },
        })
        .addButton("Approve", "approve")
        .addButton("Reject", "reject")
        .setDialogData(dialogData)
        .open("dialog");

      // Wait for dialog to close
      dialogData.unloadLock.promise.then(() => {
        const result = dialogData._lastButtonId as "approve" | "reject";
        resolve(result || "reject");
      });
    });
  }

  /**
   * Show approval dialog for loading a saved conversation note.
   */
  public async showLoadConversationDialog(
    notes: any[],
  ): Promise<number | null> {
    return new Promise((resolve) => {
      if (!notes || notes.length === 0) {
        resolve(null);
        return;
      }

      const dialogData = {
        _lastButtonId: "",
        selectedValue: notes[0].id,
        unloadLock: Zotero.Promise.defer(),
      };

      const optionsHtml = notes
        .map(
          (n) =>
            `<option value="${n.id}">${this.escapeHtml(n.getDisplayTitle() || "Untitled Note")}</option>`,
        )
        .join("");

      const dialog = new ztoolkit.Dialog(3, 1)
        .addCell(0, 0, {
          tag: "h2",
          namespace: "html",
          properties: { innerHTML: "Load Conversation" },
        })
        .addCell(1, 0, {
          tag: "p",
          namespace: "html",
          properties: { innerHTML: "Select a saved Hermes chat to load:" },
        })
        .addCell(2, 0, {
          tag: "div",
          namespace: "html",
          properties: {
            innerHTML: `<select id="hermes-load-select" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">${optionsHtml}</select>`,
          },
          listeners: [
            {
              type: "change",
              listener: (e: Event) => {
                const target = e.target as HTMLSelectElement;
                dialogData.selectedValue = parseInt(target.value, 10);
              },
            },
          ],
        })
        .addButton("Load", "load")
        .addButton("Cancel", "cancel")
        .setDialogData(dialogData)
        .open("dialog");

      dialogData.unloadLock.promise.then(() => {
        if (dialogData._lastButtonId === "load") {
          resolve(dialogData.selectedValue);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Show approval dialog for agent tool permissions.
   */
  public async showPermissionApproval(
    title: string,
    description: string,
    rawInput: any,
    options: { id: string; name: string }[],
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const dialogData = {
        _lastButtonId: "",
        unloadLock: Zotero.Promise.defer(),
      };

      const rawInputStr = rawInput ? JSON.stringify(rawInput, null, 2) : "";

      const dialog = new ztoolkit.Dialog(3, 1)
        .addCell(0, 0, {
          tag: "h2",
          namespace: "html",
          properties: {
            innerHTML: "Permission Request: " + this.escapeHtml(title),
          },
        })
        .addCell(1, 0, {
          tag: "p",
          namespace: "html",
          properties: {
            innerHTML: description,
          },
        })
        .addCell(2, 0, {
          tag: "div",
          namespace: "html",
          properties: {
            innerHTML: rawInputStr
              ? `
              <button id="hermes-copy-payload-btn" style="position: absolute; top: 8px; right: 20px; padding: 2px 6px; font-size: 12px; cursor: pointer; background: #fff; border: 1px solid #ccc; border-radius: 4px; z-index: 10; color: #333;">📋 Copy</button>
              <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">${this.syntaxHighlightJson(rawInputStr)}</pre>
            `
              : "",
          },
          styles: {
            position: "relative",
            maxHeight: "200px",
            overflowY: "auto",
            border: rawInputStr ? "1px solid #ccc" : "none",
            padding: rawInputStr ? "8px" : "0",
            background: rawInputStr ? "#f5f5f5" : "transparent",
            borderRadius: "4px",
            fontFamily: "monospace",
          },
          listeners: [
            {
              type: "click",
              listener: (e: Event) => {
                const target = e.target as HTMLElement;
                if (target.id === "hermes-copy-payload-btn") {
                  if (
                    typeof Zotero !== "undefined" &&
                    Zotero.Utilities &&
                    Zotero.Utilities.Internal
                  ) {
                    Zotero.Utilities.Internal.copyTextToClipboard(rawInputStr);
                  } else if (navigator && navigator.clipboard) {
                    navigator.clipboard.writeText(rawInputStr);
                  }
                  target.innerText = "✅ Copied";
                  setTimeout(() => {
                    if (target) target.innerText = "📋 Copy";
                  }, 2000);
                }
              },
            },
          ],
        });

      for (const option of options) {
        dialog.addButton(option.name, option.id);
      }

      if (
        !options.some(
          (o) => o.id === "cancel" || o.name.toLowerCase() === "cancel",
        )
      ) {
        dialog.addButton("Cancel", "cancel");
      }

      dialog.setDialogData(dialogData).open("dialog");

      // Wait for dialog to close
      dialogData.unloadLock.promise.then(() => {
        const result = dialogData._lastButtonId;
        if (!result || result === "cancel") {
          resolve(null);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Generate a simple diff between two texts.
   */
  private generateDiff(oldText: string, newText: string): string {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");

    const result: string[] = [];
    let oldIndex = 0;
    let newIndex = 0;

    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex >= oldLines.length) {
        // Added lines
        result.push(
          `<span style="color: #4caf50; background: #e8f5e9;">+ ${this.escapeHtml(newLines[newIndex])}</span>`,
        );
        newIndex++;
      } else if (newIndex >= newLines.length) {
        // Removed lines
        result.push(
          `<span style="color: #f44336; background: #ffebee;">- ${this.escapeHtml(oldLines[oldIndex])}</span>`,
        );
        oldIndex++;
      } else if (oldLines[oldIndex] === newLines[newIndex]) {
        // Unchanged
        result.push(
          `<span style="color: #666;">  ${this.escapeHtml(oldLines[oldIndex])}</span>`,
        );
        oldIndex++;
        newIndex++;
      } else {
        // Modified
        result.push(
          `<span style="color: #f44336; background: #ffebee;">- ${this.escapeHtml(oldLines[oldIndex])}</span>`,
        );
        result.push(
          `<span style="color: #4caf50; background: #e8f5e9;">+ ${this.escapeHtml(newLines[newIndex])}</span>`,
        );
        oldIndex++;
        newIndex++;
      }
    }

    return result.join("<br>");
  }

  /**
   * Adds inline CSS syntax highlighting to a formatted JSON string.
   */
  private syntaxHighlightJson(json: string): string {
    const escaped = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let style = "color: #032f62;"; // default
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            style = "color: #d73a49; font-weight: 500;"; // key (red)
          } else {
            style = "color: #22863a;"; // string value (green)
          }
        } else if (/true|false/.test(match)) {
          style = "color: #e36209;"; // boolean (orange)
        } else if (/null/.test(match)) {
          style = "color: #6a737d; font-style: italic;"; // null (grey)
        } else {
          style = "color: #005cc5;"; // number (blue)
        }
        return `<span style="${style}">${match}</span>`;
      },
    );
  }

  /**
   * Escape HTML special characters.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
