# Coding Conventions

## TypeScript Guidelines

### Type Safety

- Use strict TypeScript mode
- Avoid `any` type - use `unknown` or proper types
- Define interfaces for all data structures
- Use generics where appropriate

```typescript
// Good
interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: number;
}

// Bad
const message: any = { content: "Hello" };
```

### Naming Conventions

#### Classes

Use PascalCase for class names:

```typescript
class HermesClient {}
class ChatManager {}
class NoteManager {}
```

#### Interfaces

Use PascalCase with descriptive names:

```typescript
interface ConnectionConfig {
  mode: "local" | "remote";
  url?: string;
  apiKey?: string;
}
```

#### Functions and Methods

Use camelCase:

```typescript
function sendMessage(text: string): Promise<void> {}
function handleError(error: Error): void {}
```

#### Constants

Use UPPER_SNAKE_CASE for true constants:

```typescript
const MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_TIMEOUT_MS = 30000;
```

#### Private Members

Prefix with underscore for private class members:

```typescript
class ChatManager {
  private _messages: ChatMessage[] = [];
  private _listeners: Set<() => void> = new Set();
}
```

### File Organization

#### Imports

Order imports by category:

```typescript
// 1. External libraries
import { createRoot } from "react-dom/client";

// 2. Zotero APIs
import { Zotero } from "zotero";

// 3. Internal modules
import { HermesClient } from "./HermesClient";
import { ChatManager } from "./ChatManager";

// 4. Utilities
import { debounce } from "../utils/debounce";
```

#### File Structure

Each file should have a single responsibility:

```
HermesClient.ts    - ACP protocol communication
ChatManager.ts     - Conversation state
NoteManager.ts     - Note operations
ItemManager.ts     - Item metadata
```

### Error Handling

#### Always Handle Errors

```typescript
// Good
try {
  await saveNote(content);
} catch (error) {
  if (error instanceof Zotero.Error) {
    handleZoteroError(error);
  } else {
    handleGenericError(error);
  }
}

// Bad - Silent failure
await saveNote(content).catch(() => {});
```

#### Use Custom Error Types

```typescript
class HermesError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "HermesError";
  }
}

class ConnectionError extends HermesError {
  constructor(message: string) {
    super(message, "CONNECTION_ERROR");
  }
}
```

### Async Patterns

#### Prefer Async/Await

```typescript
// Good
async function loadItems(): Promise<Zotero.Item[]> {
  const items = await Zotero.Items.getAll();
  return items.filter((item) => item.isNote());
}

// Bad - Promise chains
function loadItems(): Promise<Zotero.Item[]> {
  return Zotero.Items.getAll().then((items) =>
    items.filter((item) => item.isNote()),
  );
}
```

#### Handle Concurrent Operations

```typescript
// Good - Process in parallel with limit
async function processBatch(items: Zotero.Item[]): Promise<void> {
  const limit = 5;
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    await Promise.all(batch.map(processItem));
  }
}

// Bad - Process all at once (may overwhelm system)
await Promise.all(items.map(processItem));
```

### Documentation

#### JSDoc Comments

Document all public APIs:

```typescript
/**
 * Send a message to the Hermes agent.
 * @param text - The message content
 * @param context - Optional context items to include
 * @returns Promise that resolves when message is sent
 * @throws {ConnectionError} If not connected to agent
 * @example
 * await client.sendMessage("Summarize this paper", [item]);
 */
public async sendMessage(
  text: string,
  context?: ContextItem[],
): Promise<void> {
  // Implementation
}
```

#### Inline Comments

Explain complex logic:

```typescript
// Calculate exponential backoff with jitter
// This prevents thundering herd on reconnection
const delay =
  Math.min(baseDelay * Math.pow(2, attempt), maxDelay) + Math.random() * 1000;
```

### Testing Conventions

#### Test Structure

```typescript
describe("HermesClient", () => {
  describe("connect", () => {
    it("should establish connection when binary exists", async () => {
      // Arrange
      const client = new HermesClient();

      // Act
      await client.connect();

      // Assert
      expect(client.isConnected()).toBe(true);
    });

    it("should throw when binary not found", async () => {
      // Arrange
      const client = new HermesClient();

      // Act & Assert
      await expect(client.connect()).rejects.toThrow("Binary not found");
    });
  });
});
```

#### Mock Naming

Use descriptive mock names:

```typescript
const mockHermesBinary = vi.fn().mockReturnValue("/usr/bin/hermes");
const mockZoteroPrefs = vi.fn().mockReturnValue({ apiKey: "test" });
```

### Performance Guidelines

#### Lazy Initialization

```typescript
class HeavyComponent {
  private _instance: ExpensiveObject | null = null;

  get instance(): ExpensiveObject {
    if (!this._instance) {
      this._instance = new ExpensiveObject();
    }
    return this._instance;
  }
}
```

#### Memoization

```typescript
const getItemMetadata = memoize(async (itemID: number) => {
  const item = await Zotero.Items.getAsync(itemID);
  return {
    title: item.getDisplayTitle(),
    authors: item.getCreators(),
  };
});
```

### Security Guidelines

#### Input Validation

```typescript
function validateItemID(id: unknown): number {
  if (typeof id !== "number" || id <= 0) {
    throw new Error("Invalid item ID");
  }
  return id;
}
```

#### Output Sanitization

```typescript
function sanitizeHtml(content: string): string {
  return content
    .replace(/script/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/javascript:/gi, "");
}
```

## Code Style

### Formatting

- Use 2 spaces for indentation
- Max line length: 100 characters
- Use trailing commas in multi-line objects
- Use semicolons

### Linting

Follow ESLint configuration:

```json
{
  "extends": ["@zotero-plugin/eslint-config"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "warn"
  }
}
```

### Git Conventions

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Write descriptive commit messages
- Reference issue numbers when applicable

Example:

```
feat: add item context attachment to chat

- Allow users to attach selected Zotero items to chat messages
- Extract metadata (title, authors, abstract) from items
- Display attached items in chat UI

Closes #42
```
