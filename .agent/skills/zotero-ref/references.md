# Zotero Plugin Development References

## External Resources

### Official Documentation

- **windingwind docs**: <https://windingwind.github.io/doc-for-zotero-plugin-dev/>
  - Primary reference for zotero-plugin-toolkit API
  - Covers UI creation, item management, reader integration
  - Build and release workflows

### Type Definitions

- **zotero-types**: Included via `zotero-types` npm package
  - Extends `zotero-types/entries/sandbox/`
  - Provides `_ZoteroTypes` namespace
- **zotero-pdfjs-types**: Cloned to `.refs/zotero-pdfjs-types/`
  - PDF.js types extracted from Zotero's fork
  - Used for PDF annotation extraction
  - Entry: `.refs/zotero-pdfjs-types/types/src/pdf.d.ts`

### ESLint Config

- **@zotero-plugin/eslint-config**: v0.6.7
  - Pre-configured for Zotero plugin development
  - Imported in `eslint.config.mjs`

### MCP Server

- **Zotero MCP**: Connected to running Zotero 10.0-beta.5
  - Provides live Zotero API access
  - Plugin management (list, install, reload)
  - Debug log reading
  - DOM inspection
  - Use for runtime verification and API exploration

## Quick API Patterns

### Zotero Item Operations

```typescript
const item = await Zotero.Items.getAsync(itemID);
const title = item.getDisplayTitle();
const note = item.getNote();
```

### PDF Annotation Access

```typescript
const annotations = await item.getAnnotations();
for (const ann of annotations) {
  const text = ann.annotationText;
  const comment = ann.annotationComment;
}
```

### UI Element Creation

```typescript
const button = ztoolkit.UI.createElement(doc, "button", {
  id: "hermes-btn",
  properties: { label: "Send" },
  listeners: { command: () => handleClick() },
});
```

## Build Commands

| Command            | Purpose                    |
| ------------------ | -------------------------- |
| `npm start`        | Dev server with hot reload |
| `npm run build`    | Production build           |
| `npm test`         | Run test suite             |
| `npm run lint:fix` | Fix linting issues         |
