<!--
Source: Based on the zotero-hermes codebase, zotero-plugin-toolkit, and Zotero API patterns
-->

# Code Patterns

Complete, production-ready patterns for Zotero Hermes plugin development.

## Plugin Instance Setup (`src/index.ts`)

```typescript
import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";

// Ensure browser globals for React in Zotero sandbox
const mainWindow = Zotero.getMainWindow();
if (mainWindow) {
  if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = mainWindow;
  }
  if (typeof (globalThis as any).document === "undefined") {
    (globalThis as any).document = mainWindow.document;
  }
  if (typeof (globalThis as any).navigator === "undefined") {
    (globalThis as any).navigator = mainWindow.navigator;
  }
  if (typeof (globalThis as any).console === "undefined") {
    (globalThis as any).console = mainWindow.console;
  }
}

const basicTool = new BasicTool();

if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  _globalThis.addon = new Addon();
  Zotero[config.addonInstance] = addon;
}
```

## Addon Class with Typed Module Registry (`src/addon.ts`)

```typescript
class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    hermes?: {
      client: HermesClient | HermesApiClient;
      chat: ChatManager;
      notes: NoteManager;
      items: ItemManager;
      citations: CitationManager;
      annotations: AnnotationManager;
      tags: TagManager;
      conversations: ConversationManager;
      preferences: PreferencesManager;
      approvalDialog: ApprovalDialog;
    };
  };
  public hooks: typeof hooks;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
  }

  public log(message: string, ...data: any[]): void {
    Zotero.debug(`[Hermes] ${message}`);
  }
}
```

## Lifecycle Hooks Pattern (`src/hooks.ts`)

```typescript
async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Initialize all Hermes modules
  const approvalDialog = new ApprovalDialog(addon);
  const preferences = new PreferencesManager(addon);
  const connectionMode = preferences.getConnectionMode();
  const client =
    connectionMode === "api"
      ? new HermesApiClient(addon)
      : new HermesClient(addon);
  const chat = new ChatManager(addon);
  const notes = new NoteManager(addon, approvalDialog);
  // ... remaining modules ...

  addon.data.hermes = { client, chat, notes /* ... */ };

  // Load for existing windows
  const mainWindows = Zotero.getMainWindows();
  await Promise.all(mainWindows.map((win) => onMainWindowLoad(win)));

  addon.data.initialized = true;
}
```

## Toolbar Button (XUL) — Used in `hooks.ts`

```typescript
function registerHermesSidebar(win: _ZoteroTypes.MainWindow): void {
  const doc = win.document;
  const syncBtn = doc.getElementById("zotero-tb-sync") as any;

  if (syncBtn && !doc.getElementById("zotero-hermes-tb-chat-toggle")) {
    const btn = doc.createXULElement("toolbarbutton") as any;
    btn.setAttribute("id", "zotero-hermes-tb-chat-toggle");
    btn.setAttribute("tooltiptext", "Toggle Hermes Chat");
    btn.setAttribute("aria-pressed", "false");
    btn.style.listStyleImage =
      "url('chrome://hermes/content/icons/hermes-sidenav.svg')";

    const separator = doc.createElement("div") as any;
    separator.className = "zotero-tb-separator";

    (syncBtn.parentNode as any).insertBefore(btn, syncBtn);
    (syncBtn.parentNode as any).insertBefore(separator, syncBtn);

    btn.addEventListener("click", () => toggleHermesSidebar(win));
  }
}
```

## Full-Height Sidebar Toggle — Toggles item pane

```typescript
function toggleHermesSidebar(win: _ZoteroTypes.MainWindow): void {
  const doc = win.document;
  const btn = doc.getElementById("zotero-hermes-tb-chat-toggle");
  const itemPane = doc.getElementById("zotero-item-pane") as any;
  const deck = doc.getElementById("zotero-item-pane-content") as any;
  const sidenav = doc.getElementById("zotero-view-item-sidenav") as any;

  if (!isPressed) {
    // Hide default panels, create & show Hermes pane
    deck.style.display = "none";
    sidenav.style.display = "none";

    let hermesPane = doc.getElementById("hermes-pane-library") as any;
    if (!hermesPane) {
      hermesPane = doc.createXULElement("vbox") as any;
      hermesPane.setAttribute("id", "hermes-pane-library");
      const reactContainer = doc.createElement("div") as any;
      reactContainer.setAttribute("id", "hermes-react-root");
      hermesPane.appendChild(reactContainer);
      itemPane.appendChild(hermesPane);
    }
    hermesPane.style.display = "flex";
    btn.setAttribute("aria-pressed", "true");

    // Mount React if not yet mounted
    const root = doc.getElementById("hermes-react-root") as any;
    if (root && !root.dataset.mounted) {
      const unmount = mountHermesChat(root, addon);
      root.dataset.mounted = "true";
      root._unmount = unmount;
    }
  } else {
    // Restore defaults
    if (hermesPane) hermesPane.style.display = "none";
    deck.style.display = "";
    sidenav.style.display = "";
    btn.setAttribute("aria-pressed", "false");
  }
}
```

## ACP Client — Hermes Subprocess Spawn (`HermesClient.ts`)

```typescript
const { Subprocess } = ChromeUtils.importESModule(
  "resource://gre/modules/Subprocess.sys.mjs",
);

// Spawn via zsh with custom PATH for Homebrew
this.childProcess = await Subprocess.call({
  command: "/bin/zsh",
  arguments: ["-c", `export PATH="${customPath}:$PATH" && "${hermesPath}" acp`],
  stdin: "pipe",
  stdout: "pipe",
  stderr: "pipe",
  environment: { PYTHONUNBUFFERED: "1" },
  environmentAppend: true,
});

// NDJSON parsing from stdout
const stdoutDecoder = new TextDecoder();
this.childProcess.stdout.onInput = (data: ArrayBuffer) => {
  this.stdoutBuffer += stdoutDecoder.decode(data);
  this.processStdoutBuffer();
};
```

## API Client — SSE Streaming (`HermesApiClient.ts`)

```typescript
const response = await fetch(url, {
  method: "POST",
  headers: {
    ...this.getAuthHeaders(),
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "hermes-agent",
    messages,
    stream: true,
  }),
  signal: this.activeAbortController.signal,
});

// Parse SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  // ... SSE parsing logic ...
  // Handle data: events, emit content/reasoning/stop/usage
}
```

## React Chat View (`HermesChatView.tsx`)

```typescript
export function HermesChatViewComponent({ addon }: HermesChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);

  // Native DOM input listener (React onChange unreliable in Zotero sandbox)
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const handler = (e: Event) =>
      setInput((e.target as HTMLTextAreaElement).value);
    textarea.addEventListener("input", handler);
    return () => textarea.removeEventListener("input", handler);
  }, []);

  const { appendContent, appendReasoning, flushNow } = useStreamBuffer(
    setMessages,
    settings.get("showReasoning", true),
  );

  // Subscribe to client updates
  useEffect(() => {
    const client = hermes.client;
    const handleUpdate = (update: ChatSessionUpdate) => {
      if (update.type === "message" && update.content)
        appendContent(update.content);
      else if (update.type === "stop") flushNow();
      // ... handle reasoning, tools, terminal, usage, errors
    };
    client.onUpdate(handleUpdate);
    return () => {
      client.onUpdate(() => {});
    };
  }, [hermes.client]);
}
```

## Stream Buffer Hook (`useStreamBuffer.ts`)

```typescript
export function useStreamBuffer(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  showReasoning: boolean,
) {
  const streamingMessageIdRef = useRef<string | null>(null);
  const pendingContentRef = useRef("");
  let flushQueued = false;

  const appendContent = useCallback(
    (chunk: string) => {
      pendingContentRef.current += chunk;
      if (!flushQueued) {
        flushQueued = true;
        requestAnimationFrame(() => {
          setMessages((prev) => {
            const content = pendingContentRef.current;
            pendingContentRef.current = "";
            flushQueued = false;
            // Merge into existing assistant message or create new
            // ...
            return updated;
          });
        });
      }
    },
    [setMessages],
  );
}
```

## Item Manager — Extracting Zotero Item Metadata (`ItemManager.ts`)

```typescript
export class ItemManager {
  public getSelectedItems(): Zotero.Item[] {
    const zoteroPane = Zotero.getActiveZoteroPane();
    return zoteroPane?.getSelectedItems() || [];
  }

  public extractItemData(item: Zotero.Item): AttachedItem | null {
    return {
      id: item.id,
      key: item.key,
      title: (item.getField("title") as string) || "Untitled",
      itemType: item.itemType,
      creators: this.formatCreators(item),
      date: (item.getField("date") as string) || "",
      abstract: (item.getField("abstractNote") as string) || "",
      tags: item.getTags().map((t: any) => t.tag),
      url: (item.getField("url") as string) || undefined,
      doi: (item.getField("DOI") as string) || undefined,
    };
  }
}
```

## Conversation Persistence (`ConversationManager.ts`)

```typescript
export class ConversationManager {
  private getConversationsDir(): string {
    const profileDir = Zotero.getProfileDirectory?.();
    const convDir = profileDir.clone() as nsIFile;
    convDir.append("zotero-hermes");
    convDir.append("conversations");
    if (!convDir.exists()) {
      convDir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0o755);
    }
    return convDir.path;
  }

  public saveConversation(conversation: Conversation): void {
    const filePath = this.getConversationFile(conversation.id);
    const file = Zotero.File.pathToFile(filePath);
    Zotero.File.putContents(file, JSON.stringify(conversation, null, 2));
  }
}
```

## Approval Dialog (`ApprovalDialog.ts`)

```typescript
export class ApprovalDialog {
  public async addPendingChange(change: PendingFileChange): Promise<boolean> {
    this.pendingChanges.set(change.id, change);
    return this.showDialog(change);
  }

  private async showDialog(change: PendingFileChange): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = doc.createElement("dialog");
      dialog.innerHTML = `
        <h3>📝 ${change.action === "create" ? "Create" : "Update"} File</h3>
        <p><code>${change.path}</code></p>
        <pre>${change.content?.slice(0, 2000) || ""}</pre>
        <button class="hermes-btn-approve">Approve</button>
        <button class="hermes-btn-deny">Deny</button>
      `;
      // Wire event listeners, showModal()
    });
  }
}
```

## Configuration

### Build Config (`zotero-plugin.config.ts`)

- esbuild target: `firefox115`
- Entry: `src/index.ts`
- Output: `.scaffold/build/addon/content/scripts/hermes.js`
- Pre-build assets from `addon/`

### Preferences XHTML (`addon/content/preferences.xhtml`)

- Connection mode dropdown (ACP vs API)
- Binary path, API URL, API key fields with conditional visibility
- Feature toggles: auto-save, show reasoning, citations, annotations, tags

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
