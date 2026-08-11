# DESIGN — Hermes Agent for Zotero

**Design north star.** This document is the target state for the plugin's
design. When code and this document disagree, flag the conflict — do not
silently pick a side.

## North Star

**The plugin's job is not storing chat history. It is making the user's
research library answer back.** Every design decision is measured against
this: does it put the researcher in a conversation with their own library,
with zero context-switching?

## Design Principles

1. **Zotero-first context.** The agent answers from the user's actual
   library — attached items, notes, annotations, tags — never from
   hallucinated database access. Metadata is provided in context, not
   discovered.
2. **Local by default.** ACP/stdio mode spawns the local `hermes` binary.
   The user's data stays on their machine. API mode is opt-in for remote
   gateways.
3. **Sandbox-aware.** The plugin runs in Zotero's Firefox 115 ESR sandbox.
   React synthetic events are unreliable; all interaction uses native
   `addEventListener` via refs. No `dangerouslySetInnerHTML`, no `DOMParser`.
4. **Human-in-the-loop for writes.** Note creation, annotation writes, and
   tag application route through `ApprovalDialog`. The agent proposes; the
   user disposes.
5. **Fail visibly, never silently.** Connection errors, send failures, and
   approval rejections surface as user-facing messages. Debug logging is
   gated behind a preference.

## Component Architecture

```
HermesChatView (state + orchestration)
├── ChatHeader        — toolbar: search, conversations, attach, new, settings, export
├── SidePanels        — export dropdown, conversation list, search bar, session settings, onboarding
├── MessageList       — message list + typing indicator + error bar
│   └── ChatMessageItem — per-message: copy, save-note, edit, collapsible reasoning/tool
├── ContextBar        — attached item chips
├── InputArea         — textarea + send/stop button + slash dropdown
└── TokenDashboard    — usage footer
```

## State Model

- **Messages** — `ChatMessage[]` in React state, mirrored in `stateRef` for
  native callbacks, persisted via `ChatManager` (debounced 500ms) to
  `ConversationManager` JSON files.
- **Streaming** — `useStreamBuffer` collects chunks in refs and flushes via
  `setTimeout(50ms)`; reasoning messages are spliced before the assistant
  message.
- **Typing safety** — a 60s timeout restarts on every non-terminal update and
  clears on `stop`/`usage`/`session_info`/`error`. Prevents a stuck
  "Hermes is thinking".

## Security Model

- **Subprocess** — the `hermes` binary is spawned directly with an argument
  array (no shell), so a configured path with metacharacters cannot inject
  commands.
- **Approval** — all Zotero writes (notes, annotations, tags) require user
  approval via `ApprovalDialog`, serialised through a queue.
- **Terminal gating** — `terminal_output` updates are blocked unless the
  `allowTerminal` preference is enabled.
- **Secrets** — the API key lives in Zotero prefs and is never logged.
- **No hardcoded paths** — Zotero data/profile directories are resolved at
  runtime; no user-specific paths in source.

## Known Constraints

- Zotero's SQLite database is locked while Zotero runs — the agent cannot
  read it directly; context items are the only library access.
- PDF content extraction requires the PDF to be in Zotero storage.
- Large conversations may benefit from virtualized scrolling (not yet
  implemented).

## Open Questions

1. **Terminal abort** — the "Abort" button on terminal messages is a TODO.
   Should it send a `session/cancel` or a dedicated abort method?
2. **Conversation branching** — editing a user message truncates history and
   re-sends. Should branches be first-class (multiple parallel branches per
   conversation)?
3. **Virtualized scrolling** — needed for very large conversations. Priority
   is low until real-world usage demands it.
