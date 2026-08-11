# AGENTS

This project uses specialized AI agent skills for development.

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:

- Read skill: `cat ./.agent/skills/<skill-name>/SKILL.md`
- The skill content will load with detailed instructions on how to complete the task
- Skills are stored locally in ./.agent/skills/ directory

Usage notes:

- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
  </usage>

<available_skills>

<skill>
<name>zotero-dev</name>
<description>Core development patterns for Zotero plugins. Load when implementing features, editing src/modules/hermes/, handling Zotero API calls, or managing plugin lifecycle.</description>
<location>project</location>
</skill>

<skill>
<name>zotero-ops</name>
<description>Operations, build workflows, syncing, versioning, and release management for Zotero projects. Load when running builds, preparing releases, or troubleshooting deployment.</description>
<location>project</location>
</skill>

<skill>
<name>zotero-ref</name>
<description>Technical references, API documentation, and Zotero-specific knowledge. Load when checking API details, manifest requirements, or UI/UX standards.</description>
<location>project</location>
</skill>

<skill>
<name>project</name>
<description>Project-specific architecture, maintenance tasks, and unique conventions for this repository. Load when performing project-wide maintenance or working with the core architecture.</description>
<location>project</location>
</skill>

</available_skills>

<!-- SKILLS_TABLE_END -->

</skills_system>

---

## Governance Docs (read first)

These documents govern all work in this repo. Read them before planning or
implementing:

| Doc | Role |
|---|---|
| `DESIGN.md` | **Design north star** — target state. Every design decision is measured against it. |
| `PRODUCT.md` | **Product intent** — what the plugin is for, who it serves, what it is not. |
| `ARCHITECTURE.md` | **Current code reality** — how the code is actually structured today. |
| `.agent/rules/agent-standards.md` | **Agent contract** — sandbox constraints, security rules, code quality, worktree discipline. |

**Conflict rule:** when docs and code disagree, FLAG the conflict — do not
silently pick a side. Keep verifiable claims (test counts, file lists) in
these docs current at review time.

## Development Notes

### Zotero Sandbox Constraints (Critical)

Zotero plugins run in a **Firefox 115 ESR sandbox** with severe React limitations:

1. **Synthetic events fail** — `onChange`, `onClick`, `onKeyDown` on React elements don't fire
   - **Pattern**: Use native `addEventListener` via refs for ALL user interaction
   - **Example**: `textareaRef.current.addEventListener("keydown", handler)` instead of `onKeyDown`

2. **State ref pattern** — Native callbacks can't access React state closures
   - **Pattern**: `stateRef` mirrors all React state; native handlers read from `stateRef.current`
   - **Example**: `const st = stateRef.current; if (st.isTyping) return;`

3. **No `dangerouslySetInnerHTML`** — Crashes the sandbox with security errors
   - **Pattern**: Use `MarkdownRenderer.tsx` — pure React element creation from parsed markdown
   - **No `DOMParser` either** — also crashes; manual string parsing only

4. **Clipboard access** — Use Firefox XPCOM `nsIClipboardHelper`
   - **Pattern**: `(Components as any).classes["@mozilla.org/widget/clipboardhelper;1"].getService(...)`

### Key Architectural Decisions

#### Dual-Mode Connection

- **ACP (stdio)** — Spawns `hermes acp` subprocess, JSON-RPC 2.0 over stdio/NDJSON
- **API (HTTP)** — REST client to `hermes gateway`, SSE streaming, OpenAI-compatible format
- Both implement `ChatClient` interface; UI is agnostic

#### Stream Subscription Pattern

- `useEffect` subscribes to `client.onUpdate()` and `client.onError()`
- Minimal deps array to avoid re-subscription loops
- Callbacks use refs (`streamingMessageIdRef`, `reasoningMessageIdRef`) for mutable state

#### Buffered Streaming

- `useStreamBuffer` collects rapid chunks and flushes via `setTimeout(flushBuffer, 50)`
- Replaced `requestAnimationFrame` (unreliable in sandbox) with `setTimeout`
- Reasoning messages inserted BEFORE assistant message via `splice(assistantIndex, 0, reasoningMsg)`

#### Typing Indicator Safety

- 60-second timeout started when `sendPrompt` is called
- Reset on every non-terminal update chunk; restarted in `handleUpdate`
- Terminal events: `stop`, `usage`, `session_info`, `error`
- Prevents stuck "Hermes is thinking" when stream never terminates

#### Stop Button Wiring

- The send button doubles as a stop button — it shows `StopIcon` while `isTyping` is true
- Its native `click` handler reads `stateRef.current.isTyping` (not React state) to decide:
  - If typing → calls `client.cancel()` to abort the in-flight stream
  - If idle → calls `sendMessage()` as normal
- `cancel()` is implemented on both `HermesClient` (kills subprocess stdin) and `HermesApiClient` (aborts `AbortController`)

### Item Context Resolution

**Critical**: Zotero parent items and attachments have **different keys**.

- Parent item (book, article) has key `ABC123`
- PDF attachment is a **child item** with its own key `XYZ789`
- Storage folder is `~/Zotero/storage/XYZ789/` (attachment key, NOT parent key)
- `ItemManager.extractItemData()` is **async** — it `await`s `item.getBestAttachment()` to resolve the real attachment (the Zotero API returns a Promise; the old sync cast was silently broken)
- Passes `attachmentKey` and `storagePath` in context so agent finds the correct folder

### Agent Context Format

When items are attached, the agent receives:

```
[item]: Technical gadgetry: technological development in the aesthetic economy
Title: Technical gadgetry: technological development in the aesthetic economy
Authors: John Doe, Jane Smith
Date: 2024
Abstract: This paper explores...
Tags: technology, aesthetics, economy
DOI: 10.1234/example
URL: https://example.com/paper
Item type: journalArticle
Zotero attachment key: XYZ789
Zotero storage path: /Users/chris/Zotero/storage/XYZ789/
Zotero file path: /Users/chris/Zotero/storage/XYZ789/filename.pdf
```

The system instruction explicitly tells the agent:

- "The metadata for attached Zotero items is ALREADY provided"
- "ANSWER DIRECTLY using the provided metadata"
- "Do NOT search online, do NOT try to read the SQLite database"

This prevents hallucinations about database access or online searches.

### MCP Removal

MCP (Model Context Protocol) server integration was attempted but consistently failed:

- Connection refused errors
- "Invalid params" format mismatches
- Wrapper scripts didn't resolve the issue

**Decision**: Removed MCP dependency entirely. Agent uses provided metadata directly.

- `createSession()` sends `mcpServers: []`
- System instruction explicitly states MCP is unavailable
- All Zotero data comes from attached context items

### Worktree Development (Test-Fix Workflows)

When fixing tests or doing isolated work, use a **git worktree** — never run tests against a dirty main tree. These gotchas were harvested from the 2026-08-11 markdown parser fix (see FLEET.md Q10–Q13):

1. **Branch from the last building commit, not clean main** — clean `main` can be build-broken (e.g. `src/hooks.ts` importing a symbol that only exists on an in-flight branch). Verify the base ref builds before creating the worktree, or re-point with `git reset --hard <building-commit>`.

2. **Copy the gitignored `.env`** — the scaffold loads it via dotenv; without it you get "No Zotero Found." It contains:
   ```
   ZOTERO_PLUGIN_ZOTERO_BIN_PATH = /Applications/Zotero.app/Contents/MacOS/zotero
   ZOTERO_PLUGIN_PROFILE_PATH = /Users/chris/Library/Application Support/Zotero/Profiles/ho4rwgql.default
   ```

3. **`NODE_ENV=test` is mandatory for `npm ci`** — ambient `NODE_ENV=production` (Hermes TUI quirk) makes npm 11 omit devDependencies (only 6 packages installed otherwise). Always prefix: `NODE_ENV=test npm ci --no-audit --no-fund`.

4. **Headless Zotero teardown lingers** — the suite result appears in the log BEFORE the process exits. Run tests backgrounded, read the log for the result, then kill the process. Don't wait for exit.

5. **Never stash a dirty tree to run tests** — the test build regenerates `typings/prefs.d.ts` (tracked, ~10 deletions), which blocks a stash pop. Commit to a task branch first, then run tests.

6. **opencode sandbox blocks `/tmp` writes** — dispatch briefs must say "work only inside this worktree, no /tmp paths". Also: exit 0 is UNVERIFIED — gate on `git diff` + TASK.md status, not just the exit code.

### Files Modified in Recent Session (5 June 2026)

| File                                 | Change                                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| `src/views/HermesChatView.tsx`       | Typing timeout fix, copy buttons, metadata context passing            |
| `src/modules/hermes/HermesClient.ts` | Full metadata in context, MCP removal, system instruction update      |
| `src/modules/hermes/ItemManager.ts`  | Attachment key resolution, `storagePath`/`attachmentKey` fields       |
| `src/modules/hermes/types.ts`        | `extracted` field on `PromptContextItem`                              |
| `src/utils/MarkdownRenderer.tsx`     | Table rendering support                                               |
| `README.md`                          | Complete rewrite with features, architecture, sandbox constraints     |
| `TODO.md`                            | Updated Phase 2 completion status, added bug fix session log          |
| `AGENTS.md`                          | Added development notes, sandbox constraints, architectural decisions |
