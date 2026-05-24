/**
 * Manages annotation extraction from PDFs and Zotero's native annotation system.
 */
export class AnnotationManager {
  private readonly plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  /**
   * Get all annotations for a given item (PDF or native Zotero annotations).
   */
  public async getAnnotations(itemID: number): Promise<AnnotationData[]> {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return [];

    const annotations: AnnotationData[] = [];

    // Get native Zotero annotations (from child items)
    const childAnnotations = await this.getNativeAnnotations(item);
    annotations.push(...childAnnotations);

    // Get PDF annotations if this is a PDF attachment
    if (item.isPDFAttachment()) {
      const pdfAnnotations = await this.getPDFAnnotations(item);
      annotations.push(...pdfAnnotations);
    }

    // Also check parent item for annotations if this is an attachment
    if (item.isAttachment()) {
      const parentItem = item.parentItem;
      if (parentItem) {
        const parentAnnotations = await this.getNativeAnnotations(parentItem);
        annotations.push(...parentAnnotations);
      }
    }

    return annotations.sort((a, b) => a.page - b.page);
  }

  /**
   * Get Zotero's native annotations (child annotation items).
   */
  private async getNativeAnnotations(
    item: Zotero.Item,
  ): Promise<AnnotationData[]> {
    const annotations: AnnotationData[] = [];

    try {
      // Get child items that are annotations
      const children = item.getNotes?.() || [];
      for (const childID of children) {
        const child = await Zotero.Items.getAsync(childID);
        if (!child || child.deleted) continue;

        // Check if it's an annotation
        if ((child.itemType as string) === "annotation") {
          const annotationData = this.parseNativeAnnotation(child);
          if (annotationData) {
            annotations.push(annotationData);
          }
        }
      }

      // Also get annotations via the newer Zotero 7 API
      if (item.getAnnotations) {
        const itemAnnotations = item.getAnnotations();
        for (const annotation of itemAnnotations) {
          const annotationData = this.parseNativeAnnotation(annotation);
          if (annotationData) {
            annotations.push(annotationData);
          }
        }
      }
    } catch (error) {
      this.plugin.log("Error getting native annotations", error);
    }

    return annotations;
  }

  /**
   * Parse a native Zotero annotation into our format.
   */
  private parseNativeAnnotation(
    annotation: Zotero.Item,
  ): AnnotationData | null {
    try {
      const annotationType = annotation.annotationType || "note";
      const text = annotation.annotationText || "";
      const comment = annotation.annotationComment || "";
      const page =
        annotation.annotationPageLabel ||
        (annotation.annotationPosition
          ? String(annotation.annotationPosition)
          : "0");
      const color = annotation.annotationColor || "#ffd400";

      return {
        id: annotation.id,
        type: annotationType,
        text,
        comment,
        page: parseInt(page, 10) || 0,
        color,
        source: "zotero",
        dateModified: annotation.dateModified || "",
      };
    } catch (error) {
      this.plugin.log("Error parsing native annotation", error);
      return null;
    }
  }

  /**
   * Get annotations from a PDF file using Zotero's PDF reader.
   */
  private async getPDFAnnotations(
    item: Zotero.Item,
  ): Promise<AnnotationData[]> {
    const annotations: AnnotationData[] = [];

    try {
      // Use Zotero's PDF reader API if available
      if (Zotero.PDFWorker) {
        const pdfAnnotations = await Zotero.PDFWorker.getAnnotations(item.id);
        for (const pdfAnn of pdfAnnotations) {
          annotations.push({
            id: pdfAnn.id || `pdf-${Date.now()}-${Math.random()}`,
            type: this.mapPDFAnnotationType(pdfAnn.type),
            text: pdfAnn.text || "",
            comment: pdfAnn.comment || "",
            page: pdfAnn.page || 0,
            color: pdfAnn.color || "#ffd400",
            source: "pdf",
            dateModified: pdfAnn.dateModified || "",
          });
        }
      }
    } catch (error) {
      this.plugin.log("Error getting PDF annotations", error);
    }

    return annotations;
  }

  /**
   * Map PDF annotation types to our unified format.
   */
  private mapPDFAnnotationType(pdfType: string): string {
    const typeMap: Record<string, string> = {
      highlight: "highlight",
      underline: "underline",
      strikeout: "strikeout",
      note: "note",
      text: "note",
      ink: "ink",
      caret: "caret",
      popup: "note",
    };
    return typeMap[pdfType?.toLowerCase()] || "note";
  }

  /**
   * Format annotations as context for Hermes prompt.
   */
  public formatAnnotationsForPrompt(
    annotations: AnnotationData[],
  ): Array<{ type: string; content: string }> {
    if (annotations.length === 0) return [];

    const groupedByPage = this.groupByPage(annotations);
    const contexts: Array<{ type: string; content: string }> = [];

    for (const [page, pageAnnotations] of groupedByPage) {
      const pageContent = pageAnnotations
        .map((ann) => {
          const parts = [
            `[${ann.type.toUpperCase()}]`,
            ann.text ? `Text: "${ann.text}"` : "",
            ann.comment ? `Comment: "${ann.comment}"` : "",
            ann.color ? `Color: ${ann.color}` : "",
          ];
          return parts.filter(Boolean).join("\n  ");
        })
        .join("\n\n");

      contexts.push({
        type: "annotation",
        content: `Page ${page}:\n${pageContent}`,
      });
    }

    return contexts;
  }

  /**
   * Group annotations by page number.
   */
  private groupByPage(
    annotations: AnnotationData[],
  ): Map<number, AnnotationData[]> {
    const grouped = new Map<number, AnnotationData[]>();
    for (const ann of annotations) {
      const page = ann.page || 0;
      if (!grouped.has(page)) {
        grouped.set(page, []);
      }
      grouped.get(page)!.push(ann);
    }
    return grouped;
  }

  /**
   * Create a new Zotero annotation on an item.
   */
  public async createAnnotation(
    parentItemID: number,
    annotationType: string,
    text: string,
    comment: string = "",
    page: number = 0,
    color: string = "#ffd400",
  ): Promise<number | null> {
    try {
      const parentItem = await Zotero.Items.getAsync(parentItemID);
      if (!parentItem) return null;

      const annotation = new Zotero.Item("annotation");
      annotation.libraryID = parentItem.libraryID;
      annotation.parentID = parentItemID;
      annotation.annotationType = annotationType as any;
      annotation.annotationText = text;
      annotation.annotationComment = comment;
      annotation.annotationPageLabel = String(page);
      annotation.annotationColor = color;

      await annotation.saveTx();
      return annotation.id;
    } catch (error) {
      this.plugin.log("Error creating annotation", error);
      return null;
    }
  }

  /**
   * Get annotation summary for display.
   */
  public getAnnotationSummary(annotations: AnnotationData[]): string {
    if (annotations.length === 0) return "No annotations";

    const byType = annotations.reduce(
      (acc, ann) => {
        acc[ann.type] = (acc[ann.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const parts = Object.entries(byType).map(
      ([type, count]) => `${count} ${type}s`,
    );
    return `${annotations.length} annotations (${parts.join(", ")})`;
  }
}

export interface AnnotationData {
  id: string | number;
  type: string;
  text: string;
  comment: string;
  page: number;
  color: string;
  source: "zotero" | "pdf";
  dateModified: string;
}
