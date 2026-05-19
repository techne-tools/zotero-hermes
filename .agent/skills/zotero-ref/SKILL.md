---
name: zotero-ref
description: Technical references, API documentation, and Zotero-specific knowledge. Load when checking API details, manifest requirements, or UI/UX standards.
---

# Zotero Reference Skill

This skill provides technical references and API documentation for Zotero plugin development.

## Purpose

To provide quick access to Zotero API patterns, manifest requirements, and UI guidelines.

## Scope

This skill covers:

- Zotero API reference
- Manifest requirements
- UI/UX standards
- File format specifications
- External resources

## Zotero API Quick Reference

### Items

```typescript
// Get item by ID
const item = await Zotero.Items.getAsync(itemID);

// Get all items in library
const items = await Zotero.Items.getAll(libraryID);

// Get selected items
const selected = Zotero.getActiveZoteroPane().getSelectedItems();

// Create new item
const item = new Zotero.Item("note");
item.libraryID = Zotero.Libraries.userLibraryID;
await item.saveTx();
```

### Collections

```typescript
// Get all collections
const collections = await Zotero.Collections.getAll(libraryID);

// Get items in collection
const items = await collection.getChildItems();
```

### Notes

```typescript
// Get note content
const content = note.getNote();

// Set note content
note.setNote("New content");
await note.saveTx();

// Get parent item
const parent = await Zotero.Items.getAsync(note.parentID);
```

### PDF Annotations

```typescript
// Get annotations for item
const annotations = await item.getAnnotations();

// Create annotation
const annotation = new Zotero.Item("annotation");
annotation.parentID = pdfItem.id;
annotation.annotationType = "highlight";
annotation.annotationText = "Selected text";
await annotation.saveTx();
```

## Manifest Requirements

### Required Fields

```json
{
  "manifest_version": 2,
  "name": "Hermes Agent for Zotero",
  "version": "0.1.0",
  "description": "AI-powered research assistant",
  "author": "NousResearch",
  "applications": {
    "zotero": {
      "id": "hermes@nousresearch.com",
      "strict_min_version": "9.0.0",
      "strict_max_version": "9.*"
    }
  }
}
```

### Version Compatibility

- Zotero 9.0.0+ required
- Firefox 115 ESR based
- Check compatibility with Zotero beta releases

## UI Guidelines

### XUL Elements

- Use `vbox` and `hbox` for layout
- Use `label` for text
- Use `button` for actions
- Use `textbox` for input

### Styling

- Use CSS variables for theming
- Support dark/light mode
- Follow Zotero's native look and feel
- Test with different themes

### Accessibility

- Add tooltips to all interactive elements
- Support keyboard navigation
- Use ARIA labels where appropriate
- Test with screen readers

## External Resources

### Official Documentation

- [Zotero Plugin Dev Guide](https://windingwind.github.io/doc-for-zotero-plugin-dev/)
- [Zotero Types](https://github.com/windingwind/zotero-types)
- [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit)

### Community

- [Zotero Forums](https://forums.zotero.org/)
- [Zotero Discord](https://discord.gg/zotero)
- [Zotero Chinese Community](https://zotero-chinese.com/)

### Hermes Agent

- [Hermes Agent Docs](https://hermes-agent.nousresearch.com/docs/)
- [ACP Protocol Spec](https://github.com/NousResearch/hermes-agent/blob/main/docs/acp.md)
- [Hermes GitHub](https://github.com/NousResearch/hermes-agent)

## File Format Specifications

### Zotero Note Format

- HTML subset supported
- Special tags: `<p>`, `<div>`, `<span>`, `<br>`, `<b>`, `<i>`, `<u>`, `<a>`, `<img>`, `<table>`, `<tr>`, `<td>`, `<blockquote>`, `<pre>`, `<code>`, `<h1>`-`<h6>`, `<ul>`, `<ol>`, `<li>`, `<sub>`, `<sup>`, `<strike>`
- Citations use special `<span class="citation">` format
- Images stored as attachments

### Citation Styles

- CSL 1.0.2 format
- Support for 10,000+ styles
- Custom styles can be added
