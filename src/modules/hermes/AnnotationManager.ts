import type Addon from "../../addon";

export interface AnnotationData {
  id: string;
  page: number;
  type: string;
  text: string;
  comment?: string;
  color?: string;
  position?: any;
}

/**
 * Manages annotation extraction from PDFs and Zotero's native annotation system.
 */
export class AnnotationManager {
  private readonly addon: Addon;

  constructor(addon: Addon) {
    this.addon = addon;
  }

  public async getAnnotations(itemID: number): Promise<AnnotationData[]> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return [];

    let pdfItem: Zotero.Item | null = null;
    if (item.isRegularItem()) {
      try {
        const bestAttachment = (item as any).getBestAttachment?.() as
          | Zotero.Item
          | false
          | undefined;
        if (bestAttachment && bestAttachment.isPDFAttachment()) {
          pdfItem = bestAttachment;
        }
      } catch (err) {
        this.addon.log("AnnotationManager: error getting best attachment", err);
      }
    } else if (item.isPDFAttachment()) {
      pdfItem = item;
    }

    if (!pdfItem) return [];

    const annotations: AnnotationData[] = [];
    try {
      if (typeof (pdfItem as any).getAnnotations === "function") {
        const nativeAnns = (pdfItem as any).getAnnotations() as Zotero.Item[];
        for (const ann of nativeAnns) {
          annotations.push({
            id: ann.key,
            page: ann.annotationPageLabel
              ? parseInt(ann.annotationPageLabel, 10) || 0
              : 0,
            type: ann.annotationType || "highlight",
            text: ann.annotationText || "",
            comment: ann.annotationComment || "",
            color: ann.annotationColor || "",
          });
        }
      } else {
        const childIDs = pdfItem.getNotes();
        for (const childID of childIDs) {
          const child = await Zotero.Items.getAsync(childID);
          if (child && child.isAnnotation()) {
            annotations.push({
              id: child.key,
              page: child.annotationPageLabel
                ? parseInt(child.annotationPageLabel, 10) || 0
                : 0,
              type: child.annotationType || "highlight",
              text: child.annotationText || "",
              comment: child.annotationComment || "",
              color: child.annotationColor || "",
            });
          }
        }
      }
    } catch (error) {
      this.addon.log("Error getting annotations:", error);
    }

    return annotations.sort((a, b) => a.page - b.page);
  }

  public async writeAnnotation(
    parentItemID: number,
    text: string,
    comment?: string,
    page: number = 0,
    type: string = "highlight",
    color: string = "#ffd400",
  ): Promise<string> {
    const item = await Zotero.Items.getAsync(parentItemID);
    if (!item) {
      throw new Error(`Item ${parentItemID} not found`);
    }

    let pdfItem: Zotero.Item | null = null;
    if (item.isRegularItem()) {
      const bestAttachment = (item as any).getBestAttachment?.() as
        | Zotero.Item
        | false
        | undefined;
      if (bestAttachment && bestAttachment.isPDFAttachment()) {
        pdfItem = bestAttachment;
      }
    } else if (item.isPDFAttachment()) {
      pdfItem = item;
    }

    if (!pdfItem) {
      throw new Error(`No PDF attachment found for item ${parentItemID}`);
    }

    const pdfName = pdfItem.getDisplayTitle();
    const displayName = `${type.toUpperCase()} annotation on "${pdfName}" (Page ${page})`;

    const approvalDialog = (this.addon.data.hermes as any)?.approvalDialog;
    if (approvalDialog) {
      const changeId = `ann-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const previewText = `Text: "${text}"\nComment: "${comment || ""}"`;
      const approved = await approvalDialog.addPendingChange({
        action: "create",
        id: changeId,
        newContent: previewText,
        path: displayName,
        status: "pending",
        timestamp: Date.now(),
      });
      if (!approved) {
        throw new Error("Annotation creation cancelled by user.");
      }
    }

    const annotation = new Zotero.Item("annotation");
    annotation.parentItemID = pdfItem.id;
    annotation.libraryID = pdfItem.libraryID;

    annotation.annotationType = type as any;
    annotation.annotationText = text;
    annotation.annotationComment = comment || "";
    annotation.annotationColor = color;
    annotation.annotationPageLabel = page.toString();

    if (type !== "note") {
      annotation.annotationPosition = JSON.stringify({
        pageIndex: page,
        rects: [[0, 0, 100, 20]],
      });
    }

    await annotation.saveTx();
    return annotation.key;
  }
}
