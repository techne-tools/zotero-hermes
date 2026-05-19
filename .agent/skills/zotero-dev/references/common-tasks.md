# Common Tasks

## Setting Up Development Environment

### Prerequisites

- Node.js 18+
- npm or pnpm
- Zotero 9.0.0+ (beta)

### Installation

```bash
# Clone repository
git clone https://github.com/NousResearch/zotero-hermes.git
cd zotero-hermes

# Install dependencies
npm install

# Start development server
npm start
```

### IDE Setup

Recommended VS Code extensions:

- ESLint
- Prettier
- TypeScript Importer
- Zotero Plugin Dev (if available)

## Creating a New Module

### 1. Create Module File

```typescript
// src/modules/hermes/NewModule.ts
export class NewModule {
  private readonly plugin: typeof Zotero.HermesAgent;

  constructor(plugin: typeof Zotero.HermesAgent) {
    this.plugin = plugin;
  }

  public async doSomething(): Promise<void> {
    // Implementation
  }
}
```

### 2. Register in Addon

```typescript
// src/addon.ts
import { NewModule } from "./modules/hermes/NewModule";

// In constructor
this.data = {
  // ... existing data
  newModule: new NewModule(this),
};
```

### 3. Initialize in Hooks

```typescript
// src/hooks.ts
import { NewModule } from "./modules/hermes/NewModule";

async function onStartup() {
  // ... existing initialization
  addon.data.hermes.newModule = new NewModule(addon);
}
```

## Adding a UI Component

### 1. Create XUL Element

```xml
<!-- addon/content/hermes/new-component.xhtml -->
<vbox id="hermes-new-component">
  <html:div class="hermes-header">New Component</html:div>
  <html:div id="hermes-new-content" />
</vbox>
```

### 2. Add Styles

```css
/* addon/content/hermes/new-component.css */
.hermes-header {
  font-weight: bold;
  padding: 8px;
}
```

### 3. Register in Hooks

```typescript
// src/hooks.ts
function initializeHermesUI(win: Window): void {
  // ... existing initialization
  const newComponent = ztoolkit.UI.createElement(doc, "vbox", {
    id: "hermes-new-component",
    // ... properties
  });
}
```

## Adding a Slash Command

### 1. Define Command

```typescript
// src/modules/hermes/SlashCommands.ts
export interface SlashCommand {
  name: string;
  description: string;
  execute: (args: string) => Promise<string | null>;
}

const commands: SlashCommand[] = [
  {
    name: "newcommand",
    description: "Description of what it does",
    execute: async (args) => {
      // Implementation
      return "Result";
    },
  },
];
```

### 2. Register Handler

```typescript
// In chat input handler
function handleSlashCommand(text: string): void {
  const match = text.match(/^\/(\w+)\s*(.*)$/);
  if (!match) return;

  const [, command, args] = match;
  const cmd = commands.find((c) => c.name === command);
  if (cmd) {
    cmd.execute(args).then((result) => {
      if (result) {
        addMessage(result, "system");
      }
    });
  }
}
```

## Testing a Feature

### 1. Write Unit Test

```typescript
// test/newFeature.test.ts
import { describe, it, expect, vi } from "vitest";
import { NewModule } from "../src/modules/hermes/NewModule";

describe("NewModule", () => {
  it("should do something", async () => {
    const module = new NewModule(mockAddon);
    const result = await module.doSomething();
    expect(result).toBeDefined();
  });
});
```

### 2. Run Tests

```bash
npm test
```

### 3. Manual Testing

1. Build plugin: `npm run build`
2. Install in Zotero
3. Test the feature
4. Check browser console for errors

## Debugging

### Console Logging

```typescript
// Debug messages (only in debug builds)
Zotero.debug("[Hermes] Debug message");

// Always visible
console.log("[Hermes] Log message");

// Errors
Zotero.logError(error);
```

### Using Debugger

1. Open Zotero's Browser Console (Tools → Developer → Browser Console)
2. Set breakpoints in source code
3. Use `debugger;` statement in code

### Common Issues

**Plugin not loading**

- Check manifest.json version compatibility
- Verify addon ID is unique
- Check browser console for errors

**UI not appearing**

- Check element IDs match between XUL and code
- Verify CSS is loaded
- Check for JavaScript errors

**API calls failing**

- Verify Zotero is initialized
- Check async/await usage
- Look for permission issues

## Performance Optimization

### Profiling

```typescript
// Measure function execution time
const start = performance.now();
await heavyOperation();
const end = performance.now();
console.log(`Operation took ${end - start}ms`);
```

### Memory Leaks

```typescript
// Check for leaks
const initialMemory = performance.memory?.usedJSHeapSize;
// ... run operation
const finalMemory = performance.memory?.usedJSHeapSize;
console.log(`Memory delta: ${finalMemory - initialMemory} bytes`);
```

## Release Process

### 1. Update Version

```bash
npm version patch  # or minor, major
```

### 2. Update Changelog

```markdown
## [0.1.1] - 2026-06-01

### Added

- New feature description

### Fixed

- Bug fix description
```

### 3. Build and Test

```bash
npm run build
npm test
```

### 4. Create Release

```bash
npm run release
```

### 5. Verify

- Check GitHub release page
- Download and test XPI file
- Verify update URL works

## Troubleshooting

### Build Errors

```bash
# Clean build
rm -rf .scaffold/build
npm run build

# Update dependencies
npm update

# Check TypeScript errors
npx tsc --noEmit
```

### Runtime Errors

1. Check Browser Console for stack traces
2. Verify Zotero version compatibility
3. Check for missing dependencies
4. Review recent changes

### Performance Issues

1. Profile with Browser DevTools
2. Check for memory leaks
3. Optimize hot paths
4. Consider lazy loading
