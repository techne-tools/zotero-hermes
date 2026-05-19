# Common Code Patterns

## UI Component Patterns

### Creating a Sidebar Panel

```typescript
function createSidebarPanel(doc: Document): XUL.Element {
  const panel = ztoolkit.UI.createElement(doc, "vbox", {
    id: "hermes-sidebar",
    class: "hermes-panel",
    attributes: { flex: "1" },
    children: [
      {
        tag: "html:div",
        id: "hermes-messages",
        class: "hermes-messages",
      },
      {
        tag: "hbox",
        class: "hermes-input-container",
        children: [
          {
            tag: "html:textarea",
            id: "hermes-input",
            attributes: { placeholder: "Ask Hermes..." },
          },
          {
            tag: "button",
            id: "hermes-send",
            attributes: { label: "Send" },
            listeners: {
              command: () => handleSend(),
            },
          },
        ],
      },
    ],
  });
  return panel;
}
```

### React Component in XUL

```typescript
import { createRoot } from "react-dom/client";
import { ChatInterface } from "./ChatInterface";

function mountReactComponent(doc: Document, containerId: string): void {
  const container = doc.getElementById(containerId);
  if (!container) return;

  const root = createRoot(container);
  root.render(<ChatInterface />);
}
```

## Data Management Patterns

### State Management

```typescript
class ChatManager {
  private messages: ChatMessage[] = [];
  private listeners: Set<() => void> = new Set();

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}
```

### Async Queue

```typescript
class AsyncQueue<T> {
  private queue: T[] = [];
  private processing = false;

  async add(item: T): Promise<void> {
    this.queue.push(item);
    if (!this.processing) {
      await this.process();
    }
  }

  private async process(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await this.handleItem(item);
    }
    this.processing = false;
  }

  private async handleItem(item: T): Promise<void> {
    // Process item
  }
}
```

## Zotero Integration Patterns

### Item Selection Handler

```typescript
function setupItemSelectionHandler(): void {
  const callback = {
    notify: async (event: string, type: string, ids: number[]) => {
      if (event === "select" && type === "item") {
        const items = await Zotero.Items.getAsync(ids);
        handleSelectedItems(items);
      }
    },
  };

  const notifierID = Zotero.Notifier.registerObserver(callback, ["item"]);

  // Cleanup on shutdown
  addon.hooks.onShutdown = () => {
    Zotero.Notifier.unregisterObserver(notifierID);
  };
}
```

### Batch Item Processing

```typescript
async function processItemsInBatches(
  items: Zotero.Item[],
  batchSize: number,
  processor: (item: Zotero.Item) => Promise<void>,
): Promise<void> {
  const progress = new Zotero.ProgressWindow("Processing");
  progress.show();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(processor));

    progress.changeLine({
      progress: (i / items.length) * 100,
      text: `Processed ${i}/${items.length}`,
    });
  }

  progress.close();
}
```

## Hermes Integration Patterns

### Streaming Response Handler

```typescript
async function handleStreamingResponse(
  response: AsyncGenerator<string>,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
): Promise<void> {
  try {
    for await (const chunk of response) {
      onChunk(chunk);
    }
    onComplete();
  } catch (error) {
    handleError(error);
  }
}
```

### Context Item Builder

```typescript
function buildContextFromItems(items: Zotero.Item[]): ContextItem[] {
  return items.map((item) => ({
    type: "item",
    id: item.id,
    title: item.getDisplayTitle(),
    abstract: item.getField("abstractNote") as string,
    authors: item.getCreators().map((c) => c.firstName + " " + c.lastName),
    tags: item.getTags().map((t) => t.tag),
    url: item.getField("url") as string,
  }));
}
```

## Error Handling Patterns

### Retry with Exponential Backoff

```typescript
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      const delay = Math.pow(2, attempt) * 1000;
      await Zotero.Promise.delay(delay);
    }
  }
  throw new Error("Max retries exceeded");
}
```

### Graceful Degradation

```typescript
async function fetchWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    console.warn("Primary failed, using fallback", error);
    return await fallback();
  }
}
```

## Utility Patterns

### Debounce

```typescript
function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}
```

### Memoize

```typescript
function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map();

  return ((...args: any[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}
```

## Testing Patterns

### Mock Zotero API

```typescript
const mockZotero = {
  Items: {
    getAsync: vi.fn().mockResolvedValue({
      id: 1,
      getDisplayTitle: () => "Test Item",
      getNote: () => "Note content",
    }),
  },
  Prefs: {
    get: vi.fn().mockReturnValue("default"),
    set: vi.fn(),
  },
};

vi.mock("zotero", () => mockZotero);
```

### Async Test Helper

```typescript
async function waitFor(
  condition: () => boolean,
  timeout = 5000,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timeout waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
```
