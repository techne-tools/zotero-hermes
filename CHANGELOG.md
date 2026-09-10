# Changelog

All notable changes to this project are documented in this file.

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
