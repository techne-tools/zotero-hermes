# PRODUCT — Hermes Agent for Zotero

**Product intent.** What this plugin is for, who it serves, and what it is
not. This is the product north star; DESIGN.md is the design north star.

## One-Line Product Statement

A Zotero plugin that puts the Hermes Agent in a sidebar conversation with
the researcher's own library — attach items, ask questions, get answers
grounded in the actual metadata, notes, annotations, and tags.

## Who It Serves

- **Researchers** using Zotero as their reference manager who want an AI
  assistant that already knows their library.
- **Academics** who need citations, bibliographies, and tag organisation
  without leaving Zotero.
- **Hermes Agent users** who want the same assistant in their research
  workflow as in their terminal.

## What It Is NOT

- **Not a general chat client.** The agent's context is the Zotero library.
- **Not a replacement for Zotero's own search.** The plugin complements it
  with conversational access.
- **Not a cloud service.** Local by default; API mode is opt-in.

## Core Value Propositions

1. **Zero context-switching** — ask about a paper while looking at it.
2. **Grounded answers** — the agent answers from attached item metadata, not
   hallucinated database access.
3. **Library operations in conversation** — `/cite`, `/tag`, `/annotations`,
   `/savechat` turn the chat into a library tool.
4. **Local-first** — ACP/stdio mode keeps data on the machine.

## Feature Inventory (current)

| Feature                                 | Status                           |
| --------------------------------------- | -------------------------------- |
| AI chat sidebar (React)                 | ✅ Working (restored 2026-08-11) |
| Attach selected items as context        | ✅                               |
| Dual connection (ACP stdio / API SSE)   | ✅                               |
| Note save (`/savechat`, per-message 📝) | ✅                               |
| PDF annotations (`/annotations`)        | ✅                               |
| Citations (`/cite [style]`)             | ✅                               |
| Tag suggestions (`/tag`)                | ✅                               |
| Conversation persistence + branching    | ✅                               |
| Cmd+F message search                    | ✅                               |
| Token dashboard                         | ✅                               |
| Persona switcher (`/persona`)           | ✅                               |
| Export (HTML/JSON/Markdown)             | ✅                               |
| Terminal output gating                  | ✅ (behind `allowTerminal` pref) |
| Terminal abort button                   | ⚠️ TODO                          |
| Virtualized scrolling                   | ⚠️ Not started                   |

## Roadmap (validated against user intent)

The roadmap below is the _user's_ intent, not an agent-generated feature
wishlist. It is deliberately small and focused on the research workflow.

1. **Stability** — the chat UI was restored from a stub (2026-08-11); the
   next priority is real-world testing and bug fixes.
2. **Terminal abort** — complete the TODO on terminal messages.
3. **Conversation branches as first-class** — parallel branches per
   conversation.
4. **Virtualized scrolling** — for very large conversations.

## Success Metrics

- The plugin loads without errors in Zotero 9 and 10.
- A user can attach an item, ask a question, and get a grounded answer.
- All write operations (notes, annotations, tags) require approval.
- No user-specific paths or secrets in the codebase.
