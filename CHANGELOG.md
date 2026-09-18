# Changelog

All notable changes to this project are documented in this file.

## [0.3.2] — 2026-09-18

### Added

- **Obsidian & Markdown Note Export Bridge (Feature 4)**:
  - `ExportManager` formats conversations into clean Markdown with YAML frontmatter, wikilinks, and `zotero://` deep links.
  - Configurable `obsidianVaultPath` setting to export directly to `<vaultPath>/Hermes/<Title>.md`.
  - Slash command `/export` with support for Obsidian, file picker fallback, and Zotero rich note creation (`/export note`).
  - One-click export button in `ChatHeader` and conversation history list (`SidePanels`).
- **Cross-Paper Synthesis & Collection Analysis (Feature 1)**:
  - `ItemManager.attachCollection()` and `/collection [limit]` command to load all top-level items from the active collection into context.
  - `/compare` slash command: builds structured Markdown comparison matrix tables comparing research focus, methodology/dataset, findings, and limitations.
  - `/gaps` slash command: analyzes attached literature to extract unaddressed questions, empirical blind spots, and future research agendas.
  - Updated `systemPrompt.ts` with explicit multi-paper comparative synthesis guidelines.
- **Manuscript Drafting & Better BibTeX Integration (Feature 3)**:
  - Better BibTeX citekey extraction across BBT KeyManager, extra fields, and author-year fallbacks.
  - Added `@citekey` context injection for academic citation grounding.
  - `/draft-litreview` slash command: generates thematic publication-ready prose with `@citekey` citations.
  - Enhanced `/cite` slash command with Pandoc (`[@citekey]`), LaTeX (`\cite{citekey}`), and Typst (`@citekey`) drafting snippets.
- **Active Reader Deep Workflows (Feature 2)**:
  - Registered PDF reader context menu actions: "Explain Selection with Hermes" and "Critique Argument with Hermes".
  - Floating `⚡ Hermes` action button on the PDF reader text selection popup.
  - Decoupled prompt dispatching through `ChatManager.onExternalPrompt()` to seamlessly activate the sidebar and stream answers on selection.

## [0.3.1] — 2026-09-11

### Security

- **Sandbox escape mitigations** in markdown parsing and link delegation:
  - Disarmed dangerous URI schemes (`javascript:`, `file:`, `chrome:`, `data:`) in `MarkdownRenderer`, rendering them as inert text and guarding anchor rendering.
  - Added support for nested parentheses in markdown link URLs (e.g. Wikipedia disambiguation, JS function calls).
  - Added explicit `e.preventDefault()` fallback for any unhandled URI schemes in `HermesChatView` to prevent Gecko chrome-level execution.
- **Workspace sandboxing & database protection**:
  - Sandboxed Hermes ACP agent session `cwd` and `workdir` to `<profile>/zotero-hermes/workspace/` (isolated from `zotero.sqlite`).
  - Disabled ACP filesystem client capabilities (`readTextFile: false, writeTextFile: false`).
- **Path traversal prevention**:
  - Enforced strict ID regex (`/^[a-zA-Z0-9_-]+$/`) across all `ConversationManager` file access methods (`getConversationFile`, `saveConversation`, `loadConversationFromFile`, `deleteConversation`).
- **Dialog deadlock fix**:
  - Added native `cancel` and `close` listeners with settled guard to `ApprovalDialog` so pressing `Escape` resolves cleanly rather than deadlocking the approval queue.

### Fixed

- **Process spawn mutex**: Added `connectPromise` mutex in `HermesClient` to prevent concurrent calls from spawning multiple `hermes acp` child processes.
- **Cross-conversation stream bleeding**: Added `abortActiveStream()` and buffer clearing on chat switch, creation, or deletion; dropped reasoning chunks targeted at inactive conversations.
- **Debounced save race**: Captured target conversation ID in `ChatManager.scheduleSave()` to prevent delayed debounced writes from clobbering switched chats.
- **Duplicate SSE stop events**: Added `stopEmitted` guard in `HermesApiClient` to prevent spurious duplicate stop notifications from finally blocks.
- **Context synchronization**: Added `removeAttachedItem()` to `ItemManager` and wired `ContextBar.onRemoveItem` to keep UI context pills and internal item tracking synchronized.
- **Multi-window teardown**: Replaced global single-toolkit reference with a per-window `WeakMap<Window, any>` in `hooks.ts` to prevent window close from disrupting other open windows.

## [0.3.0] — 2026-09-10

### Added

- **OpenDesign redesign** — "Reading Room" design language across the chat view:
  - New typography system with bundled fonts (Source Sans 3, Source Serif 4, Source Code Pro)
  - Redesigned input area: auto-growing textarea (up to 6 lines, then scroll), centred send button, symmetric padding, cursor breathing room
  - Header matched to Zotero's native toolbar height (40px) and padding
  - Updated sidebar, preferences, and pane styles to the new design tokens
- **Identity correction** — plugin now ships as `hermes@techne-tools.org` (was `hermes@nousresearch.com`); author/homepage/bugs updated to the techne-tools org

### Changed

- Input area: textarea auto-grows with content; send button fixed height, vertically centred
- Header: `min-height` 44px → 40px, vertical padding removed to match Zotero toolbar
- Theme tokens: dark/light palette refined (accent `#0b6b54`/`#45be97`, muted text, input backgrounds)

### Fixed

- Duplicate icon import in `MessageList.tsx` (build failure)
- Stale Nous Research branding in manifest, package metadata, and docs

## [0.2.0] — 2026-09-08

### Added

- Zotero 10 compatibility (Mozilla 140 ESR): `strict_max_version` → `10.*`, esbuild target `firefox140`
- Toolkit 5.2.0 migration (`ZoteroToolkit` subpath import)

### Fixed

- `NoteManager.getAsync` return type widened for zotero-types 4.1.3
- Chai error serialization in test reporter (scaffold 0.9.2)
