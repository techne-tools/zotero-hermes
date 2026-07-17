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

### Item Context Resolution

**Critical**: Zotero parent items and attachments have **different keys**.

- Parent item (book, article) has key `ABC123`
- PDF attachment is a **child item** with its own key `XYZ789`
- Storage folder is `~/Zotero/storage/XYZ789/` (attachment key, NOT parent key)
- `ItemManager.extractItemData()` calls `item.getBestAttachment()` to resolve the real attachment
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
Zotero storage path: Zotero data dir/storage/XYZ789/
Zotero file path: Zotero data dir/storage/XYZ789/filename.pdf
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
