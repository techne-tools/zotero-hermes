# Hermes Agent for Zotero

[![zotero target version](https://img.shields.io/badge/Zotero-9.0+-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)](./package.json)

A Zotero plugin that integrates the [Hermes Agent](https://github.com/nousresearch/hermes) directly into your research workflow. Chat with an AI assistant that has full context of your Zotero library — no copy-pasting, no context switching.

## Features

- **AI Chat in Zotero** — Chat with Hermes Agent in a dedicated sidebar tab
- **Zotero-First Context** — Attach selected Zotero items to conversations; the agent receives full metadata (title, authors, abstract, tags, date, DOI, URL)
- **Dual Connection Modes**
  - **ACP (stdio)** — Spawns `hermes acp` as a subprocess, communicates via JSON-RPC over stdio/NDJSON
  - **API (HTTP)** — Connects to `hermes gateway` via OpenAI-compatible `/v1/chat/completions` with SSE streaming
- **Note Operations** — Save specific assistant responses as child notes via a `📝` bubble button, or use `/savechat` to save the whole conversation history to a child note
- **PDF Annotation Integration** — Read PDF highlights/comments with the `/annotations` command, and write back annotations to Zotero with `ApprovalDialog` safety prompts
- **Citation Helpers** — Compile in-text citations and standard bibliographies in any matched CSL style with `/cite [style]` (e.g. `/cite mla` or `/cite chicago`)
- **Auto-Tagging System** — Generate tag recommendations with confidence scores for attached items based on local text analysis, and click-to-apply them to Zotero references
- **Conversation Branching** — Edit previous user messages via a pencil icon to spawn a new conversation branch, automatically truncating subsequent message history
- **Keyboard Search (Cmd+F)** — Intercepts `Cmd+F` / `Ctrl+F` to toggle and focus the chat messages search panel, supporting navigation and match counters
- **Token Dashboard** — Displays real-time input and output token counts for the last turn at the bottom of the chat view
- **Persona Switcher** — Switch system prompt orientations (Research Assistant, Citation Expert, Literature Analyst) dynamically using the `/persona [name]` command
- **Export Formats** — Export conversation history directly to HTML, JSON, or Markdown from a header dropdown menu
- **Streaming Responses** — Real-time message streaming with typing indicator
- **Reasoning Display** — Collapsible reasoning/thought process bubbles
- **Tool Call Visualization** — Expandable tool call panels with status indicators
- **Copy to Clipboard** — 📋 buttons on all message bubbles for easy text extraction
- **Markdown Rendering** — Custom sandbox-safe markdown renderer supporting headers, bold, italic, code, links, lists, blockquotes, tables, and horizontal rules
- **Dark/Light Theme** — Automatic theme detection and CSS variable-based styling
- **Slash Commands** — Built-in commands: `/clear`, `/search`, `/annotations`, `/cite`, `/tag`, `/persona`, `/savechat`, and extensible command registry
- **Preferences Panel** — Connection settings, chat toggles, and feature flags

## Architecture

```
┌─────────────────────────────────────────┐
│  Zotero Main Window                     │
│  ┌─────────────────────────────────────┐  │
│  │  Hermes Chat Tab (React 18)       │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Messages (MarkdownRenderer)│  │  │
│  │  │  Input + Send Button        │  │  │
│  │  │  Context Items Bar          │  │  │
│  │  └─────────────────────────────┘  │  │
│  └─────────────────────────────────────┘  │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐      ┌───────────────┐
│ HermesClient  │      │ HermesApiClient│
│ (ACP / stdio) │      │ (REST / SSE)   │
└───────────────┘      └───────────────┘
        │                       │
        └───────────┬───────────┘
                    ▼
            ┌───────────────┐
            │ hermes CLI   │
            │ (local AI)   │
            └───────────────┘
```

### Key Files

| File                                    | Purpose                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `src/views/HermesChatView.tsx`          | Main React chat UI — messages, input, context items, stream subscription |
| `src/modules/hermes/HermesClient.ts`    | ACP client — JSON-RPC over stdio, auto-discovery, notification handling  |
| `src/modules/hermes/HermesApiClient.ts` | API client — REST + SSE streaming, OpenAI-compatible                     |
| `src/modules/hermes/ChatManager.ts`     | Conversation state persistence                                           |
| `src/modules/hermes/ItemManager.ts`     | Zotero item metadata extraction and attachment resolution                |
| `src/modules/hermes/NoteManager.ts`     | Note read/write operations                                               |
| `src/modules/hermes/SlashCommands.ts`   | Built-in slash command registry                                          |
| `src/utils/MarkdownRenderer.tsx`        | Sandbox-safe markdown-to-React renderer (no `dangerouslySetInnerHTML`)   |
| `src/views/useStreamBuffer.ts`          | Buffered streaming hook with `setTimeout` flush                          |
| `addon/content/preferences.xhtml`       | Settings panel UI                                                        |

## Zotero Sandbox Constraints

Zotero plugins run in a **Firefox 115 ESR sandbox** with significant React limitations:

- **Synthetic events fail** — `onChange`, `onClick`, `onKeyDown` on React elements don't work
- **Solution** — All user interaction uses native `addEventListener` via refs
- **State ref pattern** — `stateRef` mirrors all React state for native callback access
- **No `dangerouslySetInnerHTML`** — Crashes the sandbox; use `MarkdownRenderer` instead
- **No `DOMParser`** — Also crashes; pure React element creation only

## Installation

### Prerequisites

1. Zotero 9.0.0 or later
2. [Hermes CLI](https://github.com/nousresearch/hermes) installed and available in `$PATH`
3. Node.js 18+ and npm

### Build from Source

```bash
git clone https://github.com/NousResearch/zotero-hermes.git
cd zotero-hermes
npm install
npm run build
```

The built `.xpi` will be in `.scaffold/build/hermes-agent-for-zotero.xpi`.

### Install in Zotero

1. Open Zotero → Tools → Add-ons
2. Click the gear icon → Install Add-on From File
3. Select `.scaffold/build/hermes-agent-for-zotero.xpi`
4. Restart Zotero

### Development

```bash
npm start
```

Starts Zotero with the plugin loaded and enables **auto hot reload** — changes to `src/` or `addon/` are automatically compiled and reloaded.

## Configuration

Open **Zotero → Edit → Settings → Hermes Agent** to configure:

- **🤖 Agent Personality** — Customise the assistant's display name
- **💬 Chat Display** — Toggle reasoning steps, tool use notices, token counter, and auto-save
- **🔌 Connection** — Choose Local (ACP/stdio) or Remote (API/SSE) mode, with test-connection buttons
- **📎 Automatic Context** — Enable citation generation, annotation reading, and tag management
- **🗂️ Saving Conversations** — Set save folder and organisation mode (flat / by-date)
- **🔊 Sound & Feel** — Typing sounds and haptic feedback toggles
- **🛡️ Security** — Terminal command approval and MCP server configuration
- **🐛 Troubleshooting** — Debug mode and onboarding reset

## Usage

1. Select items in your Zotero library
2. Click the 📎 paperclip icon in the chat to attach them as context
3. Type your question and press Send
4. The agent answers using the attached items' metadata

### Example Queries

- "Summarize this paper" (with item attached)
- "What are the key findings?" (with item attached)
- "Compare these two articles" (with multiple items attached)
- "/clear" — Clear the conversation

## Recent Changes (11 August 2026)

### Fixed

- **Chat UI restored** — the chat view was a non-functional stub (empty
  callbacks, placeholder components) since the 2026-08-02 component split.
  The full implementation was ported from git history into the proper
  component structure: `HermesChatView` (state + orchestration),
  `ChatMessageItem` (copy/save-note/edit/collapsible), `InputArea` (native
  listeners + slash dropdown), `MessageList` (typing + error),
  `SidePanels` (export/conversations/search/settings/onboarding),
  `ContextBar` (chips), `ChatHeader` (toolbar).
- **Hardcoded path removed** — `HermesClient` no longer falls back to
  `/Users/chris/Zotero`; Zotero data dir is resolved at runtime.
- **Command injection surface closed** — the `hermes` binary is now spawned
  directly with an argument array (no `zsh -c` shell string), so a
  configured path with metacharacters cannot inject commands.
- **HTML injection in note titles** — `NoteManager.writeNote` escapes the
  title before interpolating into `<h1>`.
- **`/tmp` data-loss fallback removed** — `ConversationManager` no longer
  writes conversations to `/tmp`; it falls back to the Zotero data directory.
- **Timer leak** — `HermesClient.waitForResponse` clears its 90s timeout
  when the response arrives.
- **Log bug** — `processStdoutBuffer` debug log now interpolates the line
  count (was printing the literal template string).

### Changed

- **Governance docs added** — `DESIGN.md` (design north star), `PRODUCT.md`
  (product intent), `ARCHITECTURE.md` (code reality), and
  `.agent/rules/agent-standards.md` (agent contract), wired into AGENTS.md
  with explicit precedence and a conflict rule.
- **`archive/` removed** — 1.5MB of drifting duplicate source; the live
  source is the single source of truth.
- **Tracked `.DS_Store` files removed** from git.

## Recent Changes (17 July 2026)

### Added

- **Note Creation and Saving** — Expose a save-to-note `📝` icon on messages to save them as child notes. Added `/savechat` command to output conversation as child note.
- **Note Relevance Search** — Added relevance-scoring and text-cleaning for local note search via `/search [query]`, with click-to-add context chips in chat sidebar.
- **PDF Annotation Integration** — Added `/annotations` to extract highlights and notes on attached references, and implemented programmatic annotation creation safely routed through `ApprovalDialog`.
- **CSL Citation Helper** — Added `/cite [style]` command to format in-text citations and bibliographies in APA, MLA, Chicago, and other styles.
- **Local Tag Suggester** — Added `/tag` to recommend library tags using term frequency matching and user pattern count weights.
- **Conversation Branching** — Edit previous user messages via pencil button to spawn edited dialog paths.
- **Cmd+F Search Shortcut** — Window keydown interceptor opens and focuses message search panel.
- **Token Dashboard** — Displays real-time API turn tokens dynamically.
- **Export Options Dropdown** — Exposes HTML, JSON, and Markdown export actions directly from the chat header.
- **Persona Switcher** — Added `/persona` command to switch between system prompts (Research Assistant, Citation Expert, Literature Analyst).

## Recent Changes (5 June 2026)

### Fixed

- **Preferences pane not appearing** — Added `Zotero.PreferencePanes.register()` call during startup so the Hermes Agent settings pane appears in Zotero Settings
- **Metadata context** — Full item metadata (title, authors, abstract, tags, date, DOI, URL) now passed to agent, preventing hallucinations
- **Storage folder resolution** — Attachment item key (not parent key) used for correct storage path
- **Stuck typing indicator** — Safety timeout restarts on activity, clears after 60s of no terminal event
- **Markdown tables** — Custom table rendering in sandbox-safe markdown renderer
- **Build errors** — Duplicate variable declarations in `HermesClient.ts`

### Added

- **Proper preferences pane** — Full 8-section settings UI aligned with obsidian-hermes: Agent Personality, Chat Display, Connection (local/remote with test buttons), Automatic Context, Saving Conversations, Sound & Feel, Security, Troubleshooting
- **Conversation organisation** — Flat or by-date monthly subfolders for saved conversations
- **Typing sounds** — Soft click sound via Web Audio API while agent writes (toggleable)
- **Haptic feedback** — Vibrate on agent response start (toggleable)
- **MCP server support** — Enable/disable external tool servers with path configuration
- **Reset onboarding** — Button to show welcome message again
- **Copy to clipboard** — 📋 buttons on assistant messages and reasoning bubbles
- **Stronger system prompt** — Explicitly instructs agent to answer from provided metadata
- **MCP removal** — Removed flaky MCP dependency; uses direct fs-based access

### Changed

- **System instruction** — Clarified that SQLite is locked and MCP is unavailable

## Known Issues

- SQLite database cannot be read while Zotero is running (locked)
- PDF content extraction requires the PDF to be in Zotero storage
- Large conversations may benefit from virtualized scrolling (not yet implemented)

## Roadmap

See [TODO.md](./TODO.md) for detailed implementation plan and feature backlog.

## License

[MIT](./LICENSE)

## Acknowledgments

- Built with [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) by windingwind
- Uses [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit) for Zotero API integration
- Hermes Agent by [Nous Research](https://nousresearch.com)

### Preference Pane Examples

![image](https://user-images.githubusercontent.com/33902321/211737987-cd7c5c87-9177-4159-b975-dc67690d0490.png)

- Preferences bindings
- UI Events
- Table
- Locale

See [`src/modules/preferenceScript.ts`](./src/modules/preferenceScript.ts)

### HelperExamples

![image](https://user-images.githubusercontent.com/33902321/215119473-e7d0d0ef-6d96-437e-b989-4805ffcde6cf.png)

- dialogExample
- clipboardExample
- filePickerExample
- progressWindowExample
- vtableExample(See Preference Pane Examples)

### PromptExamples

An Obsidian-style prompt(popup command input) module. It accepts text command to run callback, with optional display in the popup.

Activate with `Shift+P`.

![image](https://user-images.githubusercontent.com/33902321/215120009-e7c7ed27-33a0-44fe-b021-06c272481a92.png)

- registerAlertPromptExample

## Quick Start Guide

### 0 Requirement

1. Install a beta version of Zotero: <https://www.zotero.org/support/beta_builds>
2. Install [Node.js latest LTS version](https://nodejs.org/en/) and [Git](https://git-scm.com/)

> [!note]
> This guide assumes that you have an initial understanding of the basic structure and workings of the Zotero plugin. If you don't, please refer to the [documentation](https://www.zotero.org/support/dev/zotero_7_for_developers) and official plugin examples [Make It Red](https://github.com/zotero/make-it-red) first.

### 1 Creat Your Repo

1. Click `Use this template`
2. Git clone your new repo
   <details >
   <summary>💡 Start with GitHub Codespace</summary>

   _GitHub CodeSpace_ enables you getting started without the need to download code/IDE/dependencies locally.

   Replace the steps above and build you first plugin in 30 seconds!
   - Goto top of the [homepage](https://github.com/windingwind/zotero-plugin-template), click the green button `Use this template`, click `Open in codespace`. You may need to login to your GitHub account.
   - Wait for codespace to load.

   </details>

3. Enter the repo folder

### 2 Config Template Settings and Environment

1. Modify the settings in `./package.json`, including:

   ```jsonc
   {
     "version": "0.0.0",
     "description": "",
     "config": {
       "addonName": "", // name to be displayed in the plugin manager
       "addonID": "", // ID to avoid conflict. IMPORTANT!
       "addonRef": "", // e.g. Element ID prefix
       "addonInstance": "", // the plugin's root instance: Zotero.${addonInstance}
       "prefsPrefix": "extensions.zotero.${addonRef}", // the prefix of prefs
     },
     "repository": {
       "type": "git",
       "url": "git+https://github.com/your-github-name/repo-name.git",
     },
     "author": "Your Name",
     "bugs": {
       "url": "https://github.com/your-github-name/repo-name/issues",
     },
     "homepage": "https://github.com/your-github-name/repo-name#readme",
   }
   ```

   > [!warning]
   > Be careful to set the addonID and addonRef to avoid conflict.

   If you need to host your XPI packages outside of GitHub, modify `updateURL` and add `xpiDownloadLink` in `zotero-plugin.config.ts`.

2. Copy the environment variable file. Modify the commands that starts your installation of the beta Zotero.

   > Create a development profile (Optional)  
   > Start the beta Zotero with `/path/to/zotero -p`. Create a new profile and use it as your development profile. Do this only once

   ```sh
   cp .env.example .env
   vim .env
   ```

   If you are developing more than one plugin, you can store the bin path and profile path in the system environment variables, which can be omitted here.

3. Install dependencies with `npm install`

   > If you are using `pnpm` as the package manager for your project, you need to add `public-hoist-pattern[]=*@types/bluebird*` to `.npmrc`, see <https://github.com/windingwind/zotero-types?tab=readme-ov-file#usage>.

   If you get `npm ERR! ERESOLVE unable to resolve dependency tree` with `npm install`, which is an upstream dependency bug of typescript-eslint, use the `npm i -f` command to install it.

### 3 Coding

Start development server with `npm start`, it will:

- Prebuild the plugin in development mode
- Start Zotero with plugin loaded from `build/`
- Watch `src/**` and `addon/**`, rebuild and reload plugin in Zotero when source code changed.

#### Auto Hot Reload

Tired of endless restarting? Forget about it!

1. Run `npm start`.
2. Coding. (Yes, that's all)

When file changes are detected in `src` or `addon`, the plugin will be automatically compiled and reloaded.

<details style="text-indent: 2em">
<summary>💡 Steps to add this feature to an existing plugin</summary>

Please see [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold).

</details>

#### Debug in Zotero

You can also:

- Test code snippets in Tools -> Developer -> Run Javascript;
- Debug output with `Zotero.debug()`. Find the outputs in Help->Debug Output Logging->View Output;
- Debug UI. Zotero is built on the Firefox XUL framework. Debug XUL UI with software like [XUL Explorer](https://udn.realityripple.com/docs/Archive/Mozilla/XUL_Explorer).
  > XUL Documentation: <http://www.devdoc.net/web/developer.mozilla.org/en-US/docs/XUL.html>

### 4 Build

Run `npm run build` to build the plugin in production mode. The build output will be located in the `.scaffold/build/` directory.

For detailed build steps, refer to the [zotero-plugin-scaffold documentation](https://northword.github.io/zotero-plugin-scaffold/build.html). In short, the process can be divided into the following steps:

- Create or clear the `build/` directory
- Copy `addon/**` to `.scaffold/build/addon/**`
- Replace placeholders: substitute keywords and configurations defined in `package.json`
- Prepare localization files to avoid conflicts (see the [zotero_7_for_developers](https://www.zotero.org/support/dev/zotero_7_for_developers#avoiding_localization_conflicts) for more information):
  - Rename `**/*.flt` to `**/${addonRef}-*.flt`
  - Prefix each message with `addonRef-`
  - Generate type declaration files for FTL messages
- Prepare preferences files: prefix preference keys with `package.json#prefsPrefix` and generate type declaration files for preferences
- Use ESBuild to compile `.ts` source code to `.js`, building from `src/index.ts` to `.scaffold/build/addon/content/scripts`
- _(Production mode only)_ Compress the `.scaffold/build/addon` directory into `.scaffold/build/*.xpi`
- _(Production mode only)_ Prepare `update.json` or `update-beta.json`

> [!note]
>
> **What's the difference between dev & prod?**
>
> - This environment variable is stored in `Zotero.${addonInstance}.data.env`. The outputs to console is disabled in prod mode.
> - You can decide what users cannot see/use based on this variable.
> - In production mode, the build script will pack the plugin and update the `update.json`.

### 5 Release

To build and release, use

```shell
# version increase, git add, commit and push
# then on ci, npm run build, and release to GitHub
npm run release
```

> [!note]
> This will use [Bumpp](https://github.com/antfu-collective/bumpp) to prompt for the new version number, locally bump the version, run any (pre/post)version scripts defined in `package.json`, commit, build (optional), tag the commit with the version number and push commits and git tags. Bumpp can be configured in `zotero-plugin-config.ts`; for example, add `release: { bumpp: { execute: "npm run build" } }` to also build before committing.
>
> Subsequently GitHub Action will rebuild the plugin and use `zotero-plugin-scaffold`'s `release` script to publish the XPI to GitHub Release. In addition, a separate release (tag: `release`) will be created or updated that includes update manifests `update.json` and `update-beta.json` as assets. These will be available at `https://github.com/{{owner}}/{{repo}}/releases/download/release/update*.json`.

#### About Prerelease

The template defines `prerelease` as the beta version of the plugin, when you select a `prerelease` version in Bumpp (with `-` in the version number). The build script will create a new `update-beta.json` for prerelease use, which ensures that users of the regular version won't be able to update to the beta. Only users who have manually downloaded and installed the beta will be able to update to the next beta automatically.

When the next regular release is updated, both `update.json` and `update-beta.json` will be updated (on the special `release` release, see above) so that both regular and beta users can update to the new regular release.

> [!warning]
> Strictly, distinguishing between Zotero 6 and Zotero 7 compatible plugin versions should be done by configuring `applications.zotero.strict_min_version` in `addons.__addonID__.updates[]` of `update.json` respectively, so that Zotero recognizes it properly, see <https://www.zotero.org/support/dev/zotero_7_for_developers#updaterdf_updatesjson>.

## Details

### About Hooks

> See also [`src/hooks.ts`](https://github.com/windingwind/zotero-plugin-template/blob/main/src/hooks.ts)

1. When install/enable/startup triggered from Zotero, `bootstrap.js` > `startup` is called
   - Wait for Zotero ready
   - Load `index.js` (the main entrance of plugin code, built from `index.ts`)
   - Register resources if Zotero 7+
2. In the main entrance `index.js`, the plugin object is injected under `Zotero` and `hooks.ts` > `onStartup` is called.
   - Initialize anything you want, including notify listeners, preference panes, and UI elements.
3. When uninstall/disabled triggered from Zotero, `bootstrap.js` > `shutdown` is called.
   - `events.ts` > `onShutdown` is called. Remove UI elements, preference panes, or anything created by the plugin.
   - Remove scripts and release resources.

### About Global Variables

> See also [`src/index.ts`](https://github.com/windingwind/zotero-plugin-template/blob/main/src/index.ts)

The bootstrapped plugin runs in a sandbox, which does not have default global variables like `Zotero` or `window`, which we used to have in the overlay plugins' window environment.

This template registers the following variables to the global scope:

```plain
Zotero, ZoteroPane, Zotero_Tabs, window, document, rootURI, ztoolkit, addon;
```

### Create Elements API

The plugin template provides new APIs for bootstrap plugins. We have two reasons to use these APIs, instead of the `createElement/createElementNS`:

- In bootstrap mode, plugins have to clean up all UI elements on exit (disable or uninstall), which is very annoying. Using the `createElement`, the plugin template will maintain these elements. Just `unregisterAll` at the exit.
- Zotero 7 requires createElement()/createElementNS() → createXULElement() for remaining XUL elements, while Zotero 6 doesn't support `createXULElement`. The React.createElement-like API `createElement` detects namespace(xul/html/svg) and creates elements automatically, with the return element in the corresponding TS element type.

```ts
createElement(document, "div"); // returns HTMLDivElement
createElement(document, "hbox"); // returns XUL.Box
createElement(document, "button", { namespace: "xul" }); // manually set namespace. returns XUL.Button
```

### About Zotero API

Zotero docs are outdated and incomplete. Clone <https://github.com/zotero/zotero> and search the keyword globally.

> ⭐The [zotero-types](https://github.com/windingwind/zotero-types) provides most frequently used Zotero APIs. It's included in this template by default. Your IDE would provide hint for most of the APIs.

A trick for finding the API you want:

Search the UI label in `.xhtml`/`.flt` files, find the corresponding key in locale file. Then search this keys in `.js`/`.jsx` files.

### Directory Structure

This section shows the directory structure of a template.

- All `.js/.ts` code files are in `./src`;
- Addon config files: `./addon/manifest.json`;
- UI files: `./addon/content/*.xhtml`.
- Locale files: `./addon/locale/**/*.flt`;
- Preferences file: `./addon/prefs.js`;

```shell
.
|-- .github/                  # github conf
|-- .vscode/                  # vscode conf
|-- addon                     # static files
|   |-- bootstrap.js
|   |-- content
|   |   |-- icons
|   |   |   |-- favicon.png
|   |   |   `-- favicon@0.5x.png
|   |   |-- preferences.xhtml
|   |   `-- zoteroPane.css
|   |-- locale
|   |   |-- en-US
|   |   |   |-- addon.ftl
|   |   |   |-- mainWindow.ftl
|   |   |   `-- preferences.ftl
|   |   `-- zh-CN
|   |       |-- addon.ftl
|   |       |-- mainWindow.ftl
|   |       `-- preferences.ftl
|   |-- manifest.json
|   `-- prefs.js
|-- build                         # build dir
|-- node_modules
|-- src                           # source code of scripts
|   |-- addon.ts                  # base class
|   |-- hooks.ts                  # lifecycle hooks
|   |-- index.ts                  # main entry
|   |-- modules                   # sub modules
|   |   |-- examples.ts
|   |   `-- preferenceScript.ts
|   `-- utils                 # utilities
|       |-- locale.ts
|       |-- prefs.ts
|       |-- wait.ts
|       |-- window.ts
|       `-- ztoolkit.ts
|-- typings                   # ts typings
|   `-- global.d.ts

|-- .env                      # enviroment config (do not check into repo)
|-- .env.example              # template of enviroment config, https://github.com/northword/zotero-plugin-scaffold
|-- .gitignore                # git conf
|-- .gitattributes            # git conf
|-- .prettierrc               # prettier conf, https://prettier.io/
|-- eslint.config.mjs         # eslint conf, https://eslint.org/
|-- LICENSE
|-- package-lock.json
|-- package.json
|-- tsconfig.json             # typescript conf, https://code.visualstudio.com/docs/languages/jsconfig
|-- README.md
`-- zotero-plugin.config.ts   # scaffold conf, https://github.com/northword/zotero-plugin-scaffold
```

## Disclaimer

Use this code under AGPL. No warranties are provided. Keep the laws of your locality in mind!

If you want to change the license, please contact me at <wyzlshx@foxmail.com>
