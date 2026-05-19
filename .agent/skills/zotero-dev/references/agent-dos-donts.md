# Critical Development Guidelines

## DO's ✅

### 1. Use TypeScript

Always use TypeScript for type safety:

```typescript
// Good
function getItem(id: number): Promise<Zotero.Item> {
  return Zotero.Items.getAsync(id);
}

// Bad
function getItem(id) {
  return Zotero.Items.getAsync(id);
}
```

### 2. Handle Errors Gracefully

Always wrap risky operations:

```typescript
try {
  await saveNote(content);
} catch (error) {
  showErrorToUser(error);
  logError(error);
}
```

### 3. Clean Up Resources

Unregister observers and listeners:

```typescript
// In onShutdown()
Zotero.Notifier.unregisterObserver(notifierID);
ztoolkit.unregisterAll();
```

### 4. Use Async/Await

Prefer async/await over callbacks:

```typescript
// Good
const item = await Zotero.Items.getAsync(id);

// Bad
Zotero.Items.getAsync(id).then((item) => {
  // ...
});
```

### 5. Validate User Input

Always sanitize user input:

```typescript
function sanitizePath(path: string): string {
  // Prevent directory traversal
  return path.replace(/\.\./g, "");
}
```

### 6. Use Zotero's APIs

Leverage built-in Zotero functionality:

```typescript
// Good - Use Zotero's preference system
Zotero.Prefs.set("extensions.zotero.hermes.setting", value, true);

// Bad - Don't use localStorage or custom files
localStorage.setItem("hermes-setting", value);
```

### 7. Test Thoroughly

Write tests for all critical paths:

```typescript
describe("ChatManager", () => {
  it("should save messages", async () => {
    const chat = new ChatManager();
    chat.addUserMessage("Hello");
    expect(chat.getMessages()).toHaveLength(1);
  });
});
```

### 8. Document Public APIs

Add JSDoc comments to public methods:

```typescript
/**
 * Send a message to Hermes and get streaming response.
 * @param text - The message text
 * @param context - Optional context items
 * @returns Async generator yielding response chunks
 */
public async *sendMessage(text: string, context?: ContextItem[]): AsyncGenerator<string> {
  // ...
}
```

## DON'Ts ❌

### 1. Don't Block the UI

Never run long operations on the main thread:

```typescript
// Bad - Blocks UI
const items = await fetchAllItems(); // 10 seconds

// Good - Show progress
const progress = new Zotero.ProgressWindow("Loading");
progress.show();
const items = await fetchAllItems();
progress.close();
```

### 2. Don't Leak Memory

Always clean up event listeners:

```typescript
// Bad
window.addEventListener("click", handler); // Never removed

// Good
const handler = () => {
  /* ... */
};
window.addEventListener("click", handler);
// Later:
window.removeEventListener("click", handler);
```

### 3. Don't Trust AI Output

Always validate AI-generated content:

```typescript
// Bad
note.setNote(aiResponse); // Could contain malicious HTML

// Good
const sanitized = sanitizeHtml(aiResponse);
note.setNote(sanitized);
```

### 4. Don't Hardcode Paths

Use Zotero's path utilities:

```typescript
// Bad
const path = "/Users/name/Documents/file.pdf";

// Good
const path = Zotero.File.pathToFile("file.pdf");
```

### 5. Don't Ignore Errors

Always handle errors, even in callbacks:

```typescript
// Bad
item.saveTx().catch(() => {}); // Silent failure

// Good
try {
  await item.saveTx();
} catch (error) {
  Zotero.logError(error);
  showErrorToUser("Failed to save item");
}
```

### 6. Don't Use Global Variables

Avoid polluting the global namespace:

```typescript
// Bad
window.myPlugin = {
  /* ... */
};

// Good
const addon = new Addon();
Zotero[addon.data.config.addonInstance] = addon;
```

### 7. Don't Break Compatibility

Maintain backward compatibility:

```typescript
// Good - Check version
if (Zotero.version < "9.0.0") {
  showError("Zotero 9+ required");
  return;
}
```

### 8. Don't Skip Testing

Always test edge cases:

```typescript
// Test empty input
// Test very long input
// Test special characters
// Test concurrent operations
// Test offline mode
```

## Security Best Practices

### 1. Approval System

All AI-suggested modifications require user approval:

```typescript
async function modifyNote(
  note: Zotero.Item,
  newContent: string,
): Promise<void> {
  const approved = await showApprovalDialog(note, newContent);
  if (!approved) {
    return;
  }
  note.setNote(newContent);
  await note.saveTx();
}
```

### 2. Input Sanitization

Sanitize all user input and AI output:

```typescript
function sanitizeContent(content: string): string {
  // Remove potentially dangerous HTML
  return content.replace(/script/gi, "").replace(/on\w+\s*=/gi, "");
}
```

### 3. Secure Storage

Store sensitive data securely:

```typescript
// Good - Use Zotero's encrypted prefs
Zotero.Prefs.set("hermes.apiKey", encrypt(key), true);

// Bad - Never do this
const file = Zotero.File.pathToFile("api-key.txt");
Zotero.File.putContents(file, key);
```

## Performance Guidelines

### 1. Lazy Loading

Load heavy components only when needed:

```typescript
let heavyComponent: HeavyComponent | null = null;

function getHeavyComponent(): HeavyComponent {
  if (!heavyComponent) {
    heavyComponent = new HeavyComponent();
  }
  return heavyComponent;
}
```

### 2. Debouncing

Debounce rapid UI updates:

```typescript
let timeout: number | null = null;

function onInput(value: string): void {
  if (timeout) {
    clearTimeout(timeout);
  }
  timeout = window.setTimeout(() => {
    processInput(value);
  }, 300);
}
```

### 3. Virtual Lists

For long lists, render only visible items:

```typescript
const visibleItems = allItems.slice(
  scrollTop / itemHeight,
  (scrollTop + containerHeight) / itemHeight,
);
```

## Code Review Checklist

Before submitting code:

- [ ] TypeScript types are correct
- [ ] Error handling is comprehensive
- [ ] Resources are cleaned up
- [ ] User input is validated
- [ ] AI output is sanitized
- [ ] Tests are written and passing
- [ ] Documentation is updated
- [ ] No memory leaks
- [ ] Performance is acceptable
- [ ] Security is verified
