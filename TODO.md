# Zotero Hermes Plugin — Full Rework TODO

**Created:** 21 May 2026  
**Updated:** 30 May 2026  
**Target Version:** 0.1.0 (Alpha)  
**Platform:** Zotero 9.0.0+  
**Status:** ✅ Core Infrastructure Complete — API Mode & Preferences UI Added

---

## Phase 1: Foundation & Core Infrastructure

### Project Setup

- [x] Initialize plugin scaffold from zotero-plugin-template
  - Update package.json with Hermes branding
  - Configure manifest.json for Zotero 9
  - Set up build system with zotero-plugin-scaffold
- [x] Create core Hermes modules
  - `HermesClient.ts` — ACP protocol client with $PATH discovery
  - `ChatManager.ts` — Conversation state management
  - `NoteManager.ts` — Note read/write operations
  - `SlashCommands.ts` — Built-in slash command registry
- [x] Build sidebar UI components
  - `src/views/HermesChatView.tsx` — React 18 chat interface (standalone tab)
  - `src/views/useStreamBuffer.ts` — rAF-buffered streaming hook
  - `addon/content/hermes/sidebar.xhtml` — Legacy XUL fallback
  - `addon/content/hermes/sidebar.css` — Styling
  - `hermes-mainWindow.ftl` — English localization
- [x] Integrate with Zotero lifecycle
  - ItemPaneManager.registerSection for standalone tab
  - React mount/unmount lifecycle hooks
  - Message send/receive handlers

### Basic Connectivity

- [x] Setup ACP Protocol Communication
  - [x] Implement NDJSON message parsing for ACP protocol
  - [x] Add stdio handlers for subprocess communication
  - [x] Handle session initialization and authentication
  - [x] Implement message ID tracking and correlation
  - [x] Auto-reconnect with exponential backoff

- [x] **Add API Server Mode (Alternative to ACP)**
  - [x] Create `HermesApiClient.ts` — REST API client with SSE streaming
  - [x] OpenAI-compatible `/v1/chat/completions` endpoint support
  - [x] Bearer token authentication via `Authorization` header
  - [x] Auto-reconnect with exponential backoff
  - [x] Compatible with `hermes gateway` (port 8642)
  - [x] Same public interface as `HermesClient` (ACP) — UI doesn't need to know which is active
  - File: `src/modules/hermes/HermesApiClient.ts`

- [x] Implement Basic Chat Flow
  - [x] Connect send button to HermesClient
  - [x] Stream responses to UI in real-time
  - [x] Add typing indicator during streaming
  - [x] Handle connection errors gracefully
  - [x] Rate limiting (2s cooldown)

- [x] Error Handling & Logging
  - [x] Add comprehensive error boundaries
  - [x] Implement retry logic for failed connections
  - [x] Add user-friendly error messages
  - [x] Setup debug logging system

### Bug Fixes (30 May 2026)

- [x] **Fix textarea input in Zotero sandbox**
  - React synthetic `onChange` doesn't work in Zotero's sandboxed Firefox
  - Solution: Native DOM `input` event listener + `defaultValue` instead of `value`
  - File: `src/views/HermesChatView.tsx`

- [x] **Fix ACP connection timeout**
  - Missing `stdin: "pipe"`, `stdout: "pipe"`, `stderr: "pipe"` in Subprocess.call
  - `writeToStdin` was synchronous but Firefox Subprocess requires async
  - `session/new` param was `cwd` but should be `workdir`
  - File: `src/modules/hermes/HermesClient.ts`

- [x] **Fix dark/light theming**
  - XUL documents don't support `textContent`/`innerHTML` on `<style>` elements
  - Solution: CSSOM `sheet.insertRule()` + inline styles on container + `color-scheme` CSS property
  - Three detection methods: `matchMedia`, computed `main-window` background, document class/attr
  - File: `src/views/HermesChatView.tsx`

---

## Phase 2: Zotero Integration

### Item Context

- [ ] Selected Item Attachment
  - [ ] Add button to attach selected Zotero items to chat
  - [ ] Extract item metadata (title, authors, abstract, tags)
  - [ ] Format item context for Hermes prompt
  - [ ] Show attached items in chat UI

- [ ] Item Context Manager
  - [ ] Create `ItemManager.ts` module
  - [ ] Implement item metadata extraction
  - [ ] Support multiple item selection
  - [ ] Add context preview before sending

### Note Operations

- [ ] Note Creation/Modification
  - [ ] Implement `writeNote()` with approval system
  - [ ] Create approval dialog UI component
  - [ ] Show diff between current and proposed content
  - [ ] Handle approve/reject actions

- [ ] Note Search & Retrieval
  - [ ] Enhance `searchNotes()` with fuzzy matching
  - [ ] Add `/search` slash command
  - [ ] Display search results in chat
  - [ ] Allow selecting results as context

---

## Phase 3: Advanced Features

### PDF Annotations

- [ ] Annotation Reading
  - [ ] Create `AnnotationManager.ts` module
  - [ ] Extract annotations from PDF attachments
  - [ ] Group annotations by section/chapter
  - [ ] Include color tags and comments

- [ ] Annotation Writing (Requires approval)
  - [ ] Implement annotation creation
  - [ ] Support highlight, underline, strikeout
  - [ ] Add comments to annotations
  - [ ] Approval dialog for annotation changes

### Citation Helpers

- [ ] Citation Generation
  - [ ] Add `/cite` command for citation formatting
  - [ ] Support multiple citation styles (APA, MLA, Chicago)
  - [ ] Generate bibliographies
  - [ ] Copy to clipboard functionality

### Tag Suggestions

- [ ] Auto-Tagging System
  - [ ] Analyze item content for tag suggestions
  - [ ] Show suggested tags with confidence scores
  - [ ] Bulk apply tags to items
  - [ ] Learn from user tag patterns

---

## Phase 4: Cross-Platform Feature Porting

### Tier 1: High Impact, High Feasibility

#### 1. Ghost Text / Inline Auto-Completion

- [ ] Add inline suggestion support in Zotero's note editor
- [ ] Use Zotero's editor API for inline completions
- [ ] Support multiple alternatives with keyboard navigation
- [ ] Accept with Tab key, clear on cursor movement

#### 2. Semantic Vault RAG via `/search` Command

- [ ] Enhance existing item search functionality
- [ ] Add `/search` slash command with semantic search
- [ ] Search items by title, authors, tags, abstract
- [ ] Append search results to conversation context

#### 3. Conversation Branching with Message Editing

- [ ] Add message editing capability in Zotero sidebar
- [ ] Truncate history and create conversation branch
- [ ] Support multiple conversation branches from same session

### Tier 2: Medium Impact, Medium Feasibility

#### 4. Token Usage Dashboard

- [ ] Add token counter to Zotero sidebar status bar
- [ ] Display real-time token usage during conversation
- [ ] Show estimated cost based on API pricing

#### 5. Conversation Search with Cmd+F

- [ ] Add search functionality to Zotero sidebar
- [ ] Search through conversation history
- [ ] Real-time filtering with match counter
- [ ] Keyboard navigation (Cmd+F, Enter, Shift+Enter)

#### 6. Persona Templates

- [ ] Add `/persona` slash command to Zotero
- [ ] Pre-configured personas: Research Assistant, Citation Expert, Annotation Analyst
- [ ] Each with different system prompts and tool sets
- [ ] Save custom personas to preferences

### Tier 3: Low Impact, High Feasibility

#### 7. Export Conversations (HTML/JSON/PDF)

- [ ] Add export functionality to Zotero sidebar
- [ ] Export as HTML (self-contained with escaped output)
- [ ] Export as JSON (with metadata)
- [ ] Export as PDF (via browser print)
- [ ] Support for sharing conversations with collaborators

#### 8. Session Tools (Tool Restrictions)

- [ ] Add session tools UI to Zotero sidebar
- [ ] Allow users to restrict available tools per conversation
- [ ] Save tool restrictions with conversation

---

## Implementation Priority Matrix

| Feature | Zotero Port Difficulty | Zotero Impact | Priority |
| ------- | ---------------------- | ------------- | -------- |
| Ghost Text / Inline Auto-Completion | Medium | ⭐⭐⭐⭐ | **1** |
| Semantic Vault RAG (`/search`) | Low | ⭐⭐⭐⭐⭐ | **2** |
| Conversation Branching | Medium | ⭐⭐⭐⭐ | **3** |
| Token Usage Dashboard | Low | ⭐⭐⭐⭐ | **4** |
| Conversation Search (Cmd+F) | Medium | ⭐⭐⭐⭐ | **5** |
| Persona Templates | Low | ⭐⭐⭐⭐ | **6** |
| Export Conversations | Low | ⭐⭐⭐ | **7** |
| Session Tools (Tool Restrictions) | Low | ⭐⭐⭐ | **8** |

---

## Rework Notes

### 30 May 2026 — Major Bug Fixes & API Mode

- **Textarea input fixed**: React `onChange` doesn't work in Zotero's sandboxed Firefox. Used native DOM `input` event + `defaultValue`.
- **ACP connection fixed**: Added missing `stdin/stdout/stderr: "pipe"`, made `writeToStdin` async, corrected `workdir` param name.
- **Theming fixed**: XUL documents don't support `textContent` on `<style>` elements. Used CSSOM `sheet.insertRule()` + inline styles + `color-scheme` property.
- **API Server mode added**: New `HermesApiClient.ts` connects to `hermes gateway` via HTTP `/v1/chat/completions` with SSE streaming. Same interface as ACP client.
- **Preferences UI added**: Full settings panel with connection mode dropdown, dynamic fields for binary path / API URL / API key, and general settings toggles.

All features must follow Zotero Hermes coding conventions.

- TypeScript strict mode must be maintained
- Security considerations: approval system for note modifications
- Test across different Zotero versions (9.0.0+)
- Update `manifest.json` version after each major feature
- Consider using Zotero's existing search infrastructure for RAG
- Zotero's editor API may require different approach than Obsidian's CodeMirror 6

---

## Phase 4: Preferences & Settings (Week 4: Jun 9-15)

### ✅ Completed - Preferences Panel (30 May 2026)

- [x] **Connection Settings**
  - [x] Create preferences.xhtml panel
  - [x] Connection mode selector (ACP stdio / API HTTP)
  - [x] Hermes binary path input
  - [x] API URL and key inputs (API mode)
  - [x] Dynamic show/hide fields based on connection mode
  - Files: `addon/content/preferences.xhtml`, `src/modules/preferenceScript.ts`

- [x] **Chat Settings**
  - [x] Show reasoning toggle
  - [x] Auto-save toggle
  - [x] Enable citations/annotations/tags toggles
  - File: `addon/content/preferences.xhtml`

- [ ] **Security Settings**
  - [ ] Auto-approve threshold (e.g., small edits)
  - [ ] Require approval for all changes toggle
  - [ ] MCP server configuration
  - [ ] Security warning dialogs
  - **Estimated:** 2 days
  - **Dependencies:** Preferences panel
  - **Status:** Not started

### ⚪ Future - Conversation Persistence

- [ ] **Save Conversations to Notes**
  - [ ] Implement `saveToNote()` with formatting
  - [ ] Auto-save option with interval
  - [ ] Manual save button in chat
  - [ ] Export as HTML/PDF/Markdown
  - **Estimated:** 2 days
  - **Dependencies:** ChatManager.ts
  - **Status:** Not started

- [ ] **Load Previous Conversations**
  - [ ] Conversation history sidebar
  - [ ] Search/filter conversations
  - [ ] Resume previous chats
  - [ ] Delete/archive conversations
  - **Estimated:** 3 days
  - **Dependencies:** Save conversations
  - **Status:** Not started

---

## Phase 5: Polish & Testing (Week 5-6: Jun 16-29)

### ⚪ Future - Performance Optimization

- [ ] **UI Performance**
  - [ ] Virtualize message list for large conversations
  - [ ] Debounce input handlers
  - [ ] Optimize re-renders
  - [ ] Lazy load heavy components
  - **Estimated:** 2 days
  - **Dependencies:** Basic chat flow
  - **Status:** Not started

- [ ] **Memory Management**
  - [ ] Limit conversation history in memory
  - [ ] Cleanup unused event listeners
  - [ ] Handle large note content efficiently
  - [ ] Profile and fix memory leaks
  - **Estimated:** 2 days
  - **Dependencies:** None
  - **Status:** Not started

### ⚪ Future - Testing

- [ ] **Unit Tests**
  - [ ] HermesClient tests (mock ACP protocol)
  - [ ] ChatManager tests
  - [ ] NoteManager tests
  - [ ] ItemManager tests
  - **Estimated:** 3 days
  - **Dependencies:** Core modules complete
  - **Status:** Not started

- [ ] **Integration Tests**
  - [ ] End-to-end chat flow tests
  - [ ] Note modification tests
  - [ ] Item context tests
  - [ ] Error handling tests
  - **Estimated:** 3 days
  - **Dependencies:** Unit tests
  - **Status:** Not started

- [ ] **User Testing**
  - [ ] Alpha testing with small group
  - [ ] Collect feedback and bug reports
  - [ ] Fix critical issues
  - [ ] Performance benchmarking
  - **Estimated:** 5 days
  - **Dependencies:** All features complete
  - **Status:** Not started

### ⚪ Future - Documentation

- [ ] **User Documentation**
  - [ ] Update README with screenshots
  - [ ] Create user guide
  - [ ] FAQ section
  - [ ] Troubleshooting guide
  - **Estimated:** 2 days
  - **Dependencies:** Features complete
  - **Status:** Not started

- [ ] **Developer Documentation**
  - [ ] API documentation
  - [ ] Architecture diagrams
  - [ ] Contribution guidelines
  - [ ] Code comments review
  - **Estimated:** 2 days
  - **Dependencies:** Code complete
  - **Status:** Not started

---

## Phase 6: Release Preparation (Week 7: Jun 30 - Jul 6)

### ⚪ Future - Release Workflow

- [ ] **Beta Release**
  - [ ] Version bump to 0.1.0-beta.1
  - [ ] Create GitHub release
  - [ ] Distribute to beta testers
  - [ ] Collect feedback
  - **Estimated:** 1 day
  - **Dependencies:** Testing complete
  - **Status:** Not started

- [ ] **Stable Release**
  - [ ] Version bump to 0.1.0
  - [ ] Update changelog
  - [ ] Create release notes
  - [ ] Publish to Zotero forums
  - **Estimated:** 1 day
  - **Dependencies:** Beta feedback addressed
  - **Status:** Not started

- [ ] **Distribution**
  - [ ] Setup auto-update mechanism
  - [ ] Submit to Zotero translator repository (optional)
  - [ ] Announce on social media
  - [ ] Create demo video
  - **Estimated:** 2 days
  - **Dependencies:** Stable release
  - **Status:** Not started

---

## Future Enhancements (Post v0.1.0)

### ⚪ Backlog - Advanced AI Features

- [ ] **Persona System**
  - [ ] Pre-configured personas (Research Assistant, Writing Coach, etc.)
  - [ ] Custom persona creation
  - [ ] Persona-specific tool sets
  - [ ] Switch personas mid-conversation

- [ ] **Multi-Modal Support**
  - [ ] Image attachment and analysis
  - [ ] Chart/graph interpretation
  - [ ] Screenshot annotation
  - [ ] Visual search results

- [ ] **Collaboration Features**
  - [ ] Share conversations with team
  - [ ] Multi-user chat sessions
  - [ ] Comment on chat messages
  - [ ] Export to collaborative docs

### ⚪ Backlog - Zotero-Specific

- [ ] **Collection Management**
  - [ ] Auto-organize items into collections
  - [ ] Suggest related items
  - [ ] Generate collection summaries
  - [ ] Batch tag/categorize items

- [ ] **Literature Review Assistant**
  - [ ] Compare multiple papers
  - [ ] Extract methodologies section
  - [ ] Generate comparison tables
  - [ ] Identify research gaps

- [ ] **Writing Integration**
  - [ ] Draft sections from notes
  - [ ] Outline generation
  - [ ] Citation insertion while writing
  - [ ] Plagiarism check integration

---

## Progress Tracking

### Sprint Summary

| Sprint   | Dates        | Focus                  | Completion |
| -------- | ------------ | ---------------------- | ---------- |
| Sprint 0 | May 19       | Project Setup          | 100% ✅    |
| Sprint 1 | May 19-25    | Core Infrastructure    | 20% 🟡     |
| Sprint 2 | May 26-Jun 1 | Zotero Integration     | 0% ⚪      |
| Sprint 3 | Jun 2-8      | Advanced Features      | 0% ⚪      |
| Sprint 4 | Jun 9-15     | Preferences & Settings | 0% ⚪      |
| Sprint 5 | Jun 16-29    | Polish & Testing       | 0% ⚪      |
| Sprint 6 | Jun 30-Jul 6 | Release Prep           | 0% ⚪      |

### Metrics

- **Total Tasks:** 47
- **Completed:** 4 (8.5%)
- **In Progress:** 0 (0%)
- **Not Started:** 43 (91.5%)
- **Blocked:** 0 (0%)

### Key Decisions Log

- **19 May 2026** - Chose XUL/XHTML over pure React for sidebar (Zotero compatibility)
- **19 May 2026** - Selected ACP protocol for local communication (matches Obsidian Hermes)
- **19 May 2026** - Implemented approval system for all note modifications (security first)

### Known Issues

1. ACP protocol implementation pending - placeholder responses currently used
2. Item context attachment not yet implemented
3. No preferences panel - settings hardcoded for now
4. PDF annotation support planned for Phase 3

---

## Notes

### Development Environment Setup

```bash
# Install dependencies
npm install

# Start development server (auto hot-reload)
npm start

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint:fix
```

### Testing Checklist

- [ ] Zotero 9.0.0+ compatibility verified
- [ ] Windows/macOS/Linux cross-platform testing
- [ ] Large library performance (10,000+ items)
- [ ] Long conversation handling (100+ messages)
- [ ] Network connectivity scenarios (offline, slow connection)

### References

- [Zotero Plugin Dev Guide](https://windingwind.github.io/doc-for-zotero-plugin-dev/)
- [Zotero Types](https://github.com/windingwind/zotero-types)
- [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
- [Hermes Agent Docs](https://hermes-agent.nousresearch.com/docs/)
- [Obsidian Hermes Reference](obsidian-hermes)
