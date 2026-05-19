# Commands and Settings Implementation

## Registering Commands

### Menu Commands

Add items to Zotero's context menus:

```typescript
// Register right-click menu item
ztoolkit.Menu.register("item", {
  tag: "menuitem",
  id: "zotero-itemmenu-hermes-summarize",
  label: "Summarize with Hermes",
  commandListener: (ev) => {
    const items = Zotero.getActiveZoteroPane().getSelectedItems();
    summarizeItems(items);
  },
  icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
});
```

### Keyboard Shortcuts

Register global keyboard shortcuts:

```typescript
ztoolkit.Keyboard.register((ev, keyOptions) => {
  // Alt+H to open Hermes sidebar
  if (keyOptions.keyboard?.equals("alt,h")) {
    toggleHermesSidebar();
  }

  // Shift+Ctrl+A to attach selected items
  if (ev.shiftKey && ev.ctrlKey && ev.key === "A") {
    attachSelectedItems();
  }
});
```

### Toolbar Buttons

Add buttons to Zotero's toolbar:

```typescript
ztoolkit.UI.appendElement(
  {
    tag: "toolbarbutton",
    id: "zotero-tb-hermes",
    type: "menu-button",
    class: "zotero-tb-button",
    properties: {
      label: "Hermes Agent",
      tooltiptext: "Open Hermes AI Assistant (Alt+H)",
      image: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
    },
    listeners: {
      command: () => toggleHermesSidebar(),
    },
  },
  Zotero.getMainWindow().document.getElementById("zotero-tb-add"),
);
```

## Settings Implementation

### Preference Schema

Define preferences in `zotero-plugin.config.ts`:

```typescript
// zotero-plugin.config.ts
build: {
  prefs: {
    prefix: "extensions.zotero.hermes",
    defaults: {
      "connectionMode": "local",
      "hermesBinaryPath": "",
      "hermesApiUrl": "http://localhost:8642",
      "apiKey": "",
      "showReasoning": false,
      "showToolUse": false,
      "enableTypingSound": false,
      "conversationOrganization": "flat",
    },
  },
}
```

### Reading Preferences

```typescript
// Get preference value
const mode = Zotero.Prefs.get(
  "extensions.zotero.hermes.connectionMode",
  true,
) as string;

// Get with default
const path =
  (Zotero.Prefs.get(
    "extensions.zotero.hermes.hermesBinaryPath",
    true,
  ) as string) || "";

// Check boolean
const showReasoning = Zotero.Prefs.get(
  "extensions.zotero.hermes.showReasoning",
  true,
) as boolean;
```

### Writing Preferences

```typescript
// Set preference value
Zotero.Prefs.set("extensions.zotero.hermes.connectionMode", "remote", true);

// Set boolean
Zotero.Prefs.set("extensions.zotero.hermes.showReasoning", true, true);

// Clear preference (reset to default)
Zotero.Prefs.clear("extensions.zotero.hermes.apiKey", true);
```

### Secure Storage

For sensitive data like API keys:

```typescript
// Store encrypted
function storeApiKey(key: string): void {
  // In production, use proper encryption
  const encrypted = btoa(key); // Simple base64 for example
  Zotero.Prefs.set("extensions.zotero.hermes.apiKey", encrypted, true);
}

// Retrieve and decrypt
function getApiKey(): string {
  const encrypted = Zotero.Prefs.get(
    "extensions.zotero.hermes.apiKey",
    true,
  ) as string;
  if (!encrypted) return "";
  return atob(encrypted); // Simple base64 for example
}
```

## Preferences UI

### Creating Preferences Panel

```xml
<!-- addon/content/preferences.xhtml -->
<linkset>
  <html:link rel="localization" href="hermes-preferences.ftl" />
</linkset>

<groupbox
  onload="Zotero.__addonInstance__.hooks.onPrefsEvent('load', { window })"
>
  <label><html:h2 data-l10n-id="pref-title"></html:h2></label>

  <!-- Connection Settings -->
  <html:h3 data-l10n-id="pref-connection-title"></html:h3>

  <radiogroup preference="connectionMode">
    <radio value="local" data-l10n-id="pref-connection-local" />
    <radio value="remote" data-l10n-id="pref-connection-remote" />
  </radiogroup>

  <hbox>
    <html:label for="hermes-path" data-l10n-id="pref-hermes-path"></html:label>
    <html:input type="text" id="hermes-path" preference="hermesBinaryPath" />
    <button label="Browse..." oncommand="browseForHermes()" />
  </hbox>

  <hbox>
    <html:label for="api-url" data-l10n-id="pref-api-url"></html:label>
    <html:input type="text" id="api-url" preference="hermesApiUrl" />
  </hbox>

  <hbox>
    <html:label for="api-key" data-l10n-id="pref-api-key"></html:label>
    <html:input type="password" id="api-key" preference="apiKey" />
  </hbox>

  <button label="Test Connection" oncommand="testConnection()" />

  <!-- Chat Settings -->
  <html:h3 data-l10n-id="pref-chat-title"></html:h3>

  <checkbox preference="showReasoning" data-l10n-id="pref-show-reasoning" />
  <checkbox preference="showToolUse" data-l10n-id="pref-show-tool-use" />
  <checkbox preference="enableTypingSound" data-l10n-id="pref-typing-sound" />

  <!-- Security Settings -->
  <html:h3 data-l10n-id="pref-security-title"></html:h3>

  <checkbox preference="requireApproval" data-l10n-id="pref-require-approval" />
</groupbox>
```

### Localization

```
# addon/locale/en-US/hermes-preferences.ftl
pref-title = Hermes Agent Settings
pref-connection-title = Connection
pref-connection-local = Local (ACP)
pref-connection-remote = Remote (API)
pref-hermes-path = Hermes Binary Path
pref-api-url = API URL
pref-api-key = API Key
pref-chat-title = Chat Settings
pref-show-reasoning = Show reasoning steps
pref-show-tool-use = Show tool usage
pref-typing-sound = Enable typing sound
pref-security-title = Security
pref-require-approval = Require approval for all changes
```

### Preferences Event Handler

```typescript
// src/hooks.ts
async function onPrefsEvent(type: string, data: { window: Window }) {
  switch (type) {
    case "load":
      initializePreferences(data.window);
      break;
    case "save":
      await savePreferences(data.window);
      break;
    default:
      return;
  }
}

function initializePreferences(win: Window): void {
  const doc = win.document;

  // Setup test connection button
  const testBtn = doc.getElementById("test-connection-btn");
  testBtn?.addEventListener("command", async () => {
    const result = await testConnection();
    showConnectionResult(win, result);
  });
}
```

## Dynamic Commands

### Context-Aware Commands

Show different commands based on selection:

```typescript
function getContextCommands(): MenuItem[] {
  const items = Zotero.getActiveZoteroPane().getSelectedItems();

  if (items.length === 0) {
    return [{ label: "Open Hermes Chat", action: () => openChat() }];
  }

  if (items.length === 1 && items[0].isPDFAttachment()) {
    return [
      { label: "Summarize PDF", action: () => summarizePDF(items[0]) },
      {
        label: "Extract Annotations",
        action: () => extractAnnotations(items[0]),
      },
    ];
  }

  return [
    { label: "Summarize Selected", action: () => summarizeItems(items) },
    { label: "Compare Papers", action: () => compareItems(items) },
  ];
}
```

### Command Palette

Implement a command palette for quick access:

```typescript
function showCommandPalette(): void {
  const commands = [
    { id: "open-chat", label: "Open Hermes Chat", shortcut: "Alt+H" },
    {
      id: "attach-items",
      label: "Attach Selected Items",
      shortcut: "Shift+Ctrl+A",
    },
    { id: "summarize", label: "Summarize Selected", shortcut: "" },
    { id: "settings", label: "Open Settings", shortcut: "" },
  ];

  // Show palette UI
  const palette = new CommandPalette(commands);
  palette.show();
}
```

## Settings Migration

### Version-Based Migration

```typescript
async function migrateSettings(): Promise<void> {
  const currentVersion = addon.data.config.version;
  const lastVersion = Zotero.Prefs.get(
    "extensions.zotero.hermes.lastVersion",
    true,
  ) as string;

  if (!lastVersion) {
    // First install - initialize defaults
    initializeDefaultSettings();
    return;
  }

  if (compareVersions(lastVersion, "0.2.0") < 0) {
    // Migrate from pre-0.2.0
    await migrateToV020();
  }

  if (compareVersions(lastVersion, "0.3.0") < 0) {
    // Migrate from pre-0.3.0
    await migrateToV030();
  }

  // Update last version
  Zotero.Prefs.set(
    "extensions.zotero.hermes.lastVersion",
    currentVersion,
    true,
  );
}

async function migrateToV020(): Promise<void> {
  // Example: Rename preference
  const oldValue = Zotero.Prefs.get("extensions.zotero.hermes.oldPref", true);
  if (oldValue !== undefined) {
    Zotero.Prefs.set("extensions.zotero.hermes.newPref", oldValue, true);
    Zotero.Prefs.clear("extensions.zotero.hermes.oldPref", true);
  }
}
```

## Best Practices

### 1. Validate Settings

Always validate settings before use:

```typescript
function getValidatedSetting(
  key: string,
  validator: (value: unknown) => boolean,
): unknown {
  const value = Zotero.Prefs.get(key, true);
  if (!validator(value)) {
    console.warn(`Invalid setting ${key}, using default`);
    return getDefaultValue(key);
  }
  return value;
}
```

### 2. Handle Missing Settings

Provide sensible defaults:

```typescript
function getConnectionMode(): "local" | "remote" {
  const mode = Zotero.Prefs.get(
    "extensions.zotero.hermes.connectionMode",
    true,
  ) as string;
  if (mode === "local" || mode === "remote") {
    return mode;
  }
  return "local"; // Default
}
```

### 3. Secure Sensitive Data

Never log or expose sensitive settings:

```typescript
function logSettings(): void {
  const safeSettings = {
    connectionMode: getConnectionMode(),
    showReasoning: getShowReasoning(),
    // Don't include: apiKey, hermesBinaryPath
  };
  console.log("Settings:", safeSettings);
}
```
