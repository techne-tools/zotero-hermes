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
    const annotations: AnnotationData[] = [];
    const childAnnotations = await this.getNativeAnnotations(item);
    annotations.push(...childAnnotations);
    if (item.isPDFAttachment()) {
      const pdfAnnotations = await this.getPDFAnnotations(item);
      annotations.push(...pdfAnnotations);
    }
    return annotations.sort((a, b) => a.page - b.page);
  }

  private async getNativeAnnotations(
    item: Zotero.Item,
  ): Promise<AnnotationData[]> {
    const annotations: AnnotationData[] = [];
    try {
      const children = item.getNotes();
      for (const childID of children) {
        const child = await Zotero.Items.getAsync(childID);
        if (child && child.isAnnotation()) {
          annotations.push({
            id: child.key,
            page: child.annotationPageLabel
              ? parseInt(child.annotationPageLabel)
              : 0,
            type: child.annotationType || "highlight",
            text: child.annotationText || "",
            comment: child.annotationComment || "",
            color: child.annotationColor || "",
          });
        }
      }
    } catch (error) {
      this.addon.log("Error getting native annotations:", error);
    }
    return annotations;
  }

  private async getPDFAnnotations(
    item: Zotero.Item,
  ): Promise<AnnotationData[]> {
    // TODO: Implement PDF annotation extraction
    return [];
  }
}
