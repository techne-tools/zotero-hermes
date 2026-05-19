# Zotero Plugin Development Guidelines

## Architecture Overview

Zotero plugins are built using a combination of:

- **XUL/XHTML**: Native UI framework (Firefox-based)
- **JavaScript/TypeScript**: Core logic
- **React**: For complex interactive components (optional)
- **zotero-plugin-toolkit**: Helper library for common operations

## Plugin Lifecycle

### Startup Sequence

1. `bootstrap.js` loads the plugin
2. `addon.ts` creates the plugin instance
3. `hooks.ts` `onStartup()` initializes modules
4. `onMainWindowLoad()` sets up UI for each window

### Shutdown Sequence

1. `onShutdown()` cleans up resources
2. Unregister all observers and listeners
3. Close any open dialogs

## UI Development

### XUL Elements

Zotero's UI is built with XUL (XML User Interface Language):

```xml
<vbox id="hermes-sidebar" flex="1">
  <html:div id="chat-messages" />
  <hbox>
    <html:textarea id="input" />
    <button label="Send" />
  </hbox>
</vbox>
```

### Creating Elements Programmatically

Use `ztoolkit.UI.createElement()`:

```typescript
const button = ztoolkit.UI.createElement(doc, "button", {
  id: "hermes-btn",
  class: "hermes-primary",
  properties: { label: "Send" },
  listeners: { command: () => handleClick() },
});
```

### React Integration

For complex components like chat interfaces:

```typescript
import { createRoot } from "react-dom/client";

const container = doc.getElementById("hermes-chat-container");
const root = createRoot(container);
root.render(<ChatComponent />);
```

## Zotero API Patterns

### Item Operations

```typescript
// Reading
const item = await Zotero.Items.getAsync(id);
const title = item.getDisplayTitle();
const note = item.getNote();

// Writing
const newItem = new Zotero.Item("note");
newItem.setNote("Content");
await newItem.saveTx();
```

### Collections

```typescript
const collections = await Zotero.Collections.getAll(libraryID);
for (const collection of collections) {
  const items = await collection.getChildItems();
}
```

### Annotations

```typescript
const annotations = await item.getAnnotations();
for (const annotation of annotations) {
  const text = annotation.annotationText;
  const comment = annotation.annotationComment;
}
```

## Event Handling

### Notifiers

Register observers for Zotero events:

```typescript
const callback = {
  notify: async (event, type, ids, extraData) => {
    if (event === "select" && type === "tab") {
      // Handle tab selection
    }
  },
};
const notifierID = Zotero.Notifier.registerObserver(callback, ["tab", "item"]);
```

### Keyboard Shortcuts

```typescript
ztoolkit.Keyboard.register((ev, keyOptions) => {
  if (keyOptions.keyboard?.equals("shift,l")) {
    // Handle Shift+L
  }
});
```

## Common Pitfalls

### 1. Async Operations

Always use `await` for Zotero API calls:

```typescript
// Bad
const item = Zotero.Items.get(id); // May return promise

// Good
const item = await Zotero.Items.getAsync(id);
```

### 2. Window Management

Zotero can have multiple windows:

```typescript
// Get all windows
const windows = Zotero.getMainWindows();

// Current window
const win = Zotero.getMainWindow();
```

### 3. Memory Leaks

Always unregister observers:

```typescript
// Register
const id = Zotero.Notifier.registerObserver(callback, ["item"]);

// Unregister on shutdown
Zotero.Notifier.unregisterObserver(id);
```

### 4. UI Updates

Use `Zotero.Promise.delay()` for UI animations:

```typescript
await Zotero.Promise.delay(1000); // Wait 1 second
```

## Testing

### Unit Tests

Use vitest with Zotero mocks:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("zotero", () => ({
  Items: { getAsync: vi.fn() },
}));
```

### Integration Tests

Test with actual Zotero instance:

```typescript
// Requires Zotero to be running
const item = await Zotero.Items.getAsync(1);
expect(item).toBeDefined();
```

## Performance

### Large Libraries

Handle libraries with 10,000+ items:

```typescript
// Batch operations
const batchSize = 100;
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize);
  await processBatch(batch);
}
```

### Virtual Lists

For long lists, use virtual scrolling:

```typescript
// Only render visible items
const visibleItems = items.slice(startIndex, endIndex);
```

## Security

### Input Validation

Always validate user input:

```typescript
function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, ""); // Remove HTML tags
}
```

### Secure Storage

Use Zotero preferences for sensitive data:

```typescript
// Store
Zotero.Prefs.set("extensions.zotero.hermes.apiKey", encryptedKey, true);

// Retrieve
const key = Zotero.Prefs.get("extensions.zotero.hermes.apiKey", true);
```

## Debugging

### Console Logging

```typescript
Zotero.debug("[Hermes] Message"); // Only in debug builds
console.log("[Hermes] Message"); // Always visible
```

### Error Handling

```typescript
try {
  await riskyOperation();
} catch (error) {
  Zotero.logError(error);
  new Zotero.ProgressWindow("Error")
    .createLine({ text: error.message, type: "error" })
    .show();
}
```

## Resources

- [Zotero Plugin Dev Guide](https://windingwind.github.io/doc-for-zotero-plugin-dev/)
- [Zotero Types](https://github.com/windingwind/zotero-types)
- [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
- [Zotero Source Code](https://github.com/zotero/zotero)
