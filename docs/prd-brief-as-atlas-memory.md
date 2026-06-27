# PRD: Brief as Atlas's Memory

**Status:** Draft
**Author:** Miguel Rengifo
**Last updated:** 2026-06-27
**Related:** Atlas agent runtime, Docs/Pages, Project Brief

---

## 1. Summary

Turn the **Brief** (and a new **Workspace Brief**) into the context layer that the Atlas AI agent reads, respects, and writes back to. Today the Brief is a human-authored doc that Atlas never sees; this feature connects the richest curated context in the product to the AI — without ever exposing a file, syntax, or config to the user.

The product promise, in one line:

> **Write context in the Brief once. Atlas uses it on every task — and tells you what it learned.**

This is the "markdown file + AI" workflow developers love (CLAUDE.md / AGENTS.md), translated into a document end users already understand.

---

## 2. Problem

Atlas already has a full server-side agent runtime — a tool-use loop, self-written key/value memory, MCP servers, and per-tool approval policies. But its context is thin:

- On an issue run it sees only the issue body, recent comments, the state/label palettes, and its top-8 self-written memory rows.
- It **never reads the Brief or any Doc**, even though the Brief was designed to hold project-wide context.
- Its only durable memory (`AgentMemory`) is an opaque key/value store the user cannot see or correct.

Consequences:
- Users repeat the same context to Atlas over and over ("we ship Fridays", "never touch billing", "our customer is X").
- Atlas behaves generically because it has no standing instructions per project or team.
- Memory is a black box, so users don't trust it and can't fix it when it's wrong.

The best context in the product is invisible to the AI, and the AI's memory is invisible to the user. This feature closes both gaps.

---

## 3. Goals & non-goals

### Goals
- G1. Atlas reads the **Project Brief** as standing instructions on every run.
- G2. A **Workspace Brief** provides team-wide context that applies across all projects.
- G3. Atlas can read other Docs **on demand** (not just what's pre-loaded).
- G4. Atlas's memory becomes **legible and correctable**: it proposes additions to the Brief that the user accepts or edits.
- G5. The capability is **visible** — users understand that the Brief steers Atlas.

### Non-goals
- Vector search / embeddings / RAG over the full doc corpus (future; v1 uses keyword + truncation).
- Per-workspace Atlas *personality* changes — Atlas keeps one fixed identity; only its *context* is configurable.
- Replacing `AgentMemory` — it stays as the auto-capture layer; the Brief is the legible layer above it.
- Real-time collaborative server-side doc editing as the v1 write path (deferred — see Risks).

---

## 4. Users & use cases

| User | Use case |
|---|---|
| Project lead | Writes "all new bugs get the `triage` label and a reporter ping" in the Brief; Atlas enforces it automatically. |
| Team admin | Writes the team glossary + conventions once in the Workspace Brief; every project's Atlas inherits it. |
| IC / engineer | Asks Atlas a question on a task; Atlas reads the relevant spec Doc on its own to answer accurately. |
| Anyone | Atlas learns a recurring fact and suggests adding it to the Brief; user accepts so it's now visible and editable. |

---

## 5. Background: how it works today (grounded)

- **Brief** is a hidden per-project `Page` of `page_type="doc"` named "Project Brief", seeded from the project description, stored in the normal doc fields (`description_html`, `description_binary`, `description_stripped`). Identified by name only — no backend flag. (`apps/web/core/components/project/brief/brief-root.tsx`)
- **Agent context** is assembled in `_build_user_prompt` (issue runs) and `_build_page_comment_user_prompt` (page-comment runs) in `apps/api/plane/bgtasks/agent_dispatch_task.py`. Both inject labeled sections (Description, Available states/labels, Workspace memory, Recent comments). Adding the Brief is one more section.
- **AgentMemory** (`apps/api/plane/db/models/agent.py`) is the agent's self-written key/value store, surfaced via the `remember_memory` / `search_memory` tools and injected via `_build_memory_context`.
- **Tools** are registered as `LLMTool` closures in `base_tools`; there is currently **no tool to read a Doc or the Brief**.
- **Persona** is fixed and workspace-agnostic (`apps/api/plane/llm/persona.py`); per-workspace `agent.system_prompt` is deliberately ignored.

---

## 6. Requirements

### 6.1 Read the Project Brief (P0)
- Atlas injects the Project Brief into the prompt on both issue runs and page-comment runs, labeled as standing instructions.
- Content is truncated to a budget (~3k chars) with a truncation marker; the full text is reachable via the read-doc tool (6.3).
- If no Brief exists or it's empty, the section is omitted (no error, no noise).

### 6.2 Workspace Brief (P0)
- A workspace-scoped doc (no project association) editable in **Settings → AI**.
- Injected **above** the Project Brief, labeled as workspace-wide context.
- Precedence: Workspace Brief = baseline; Project Brief augments/overrides for its project.

### 6.3 On-demand doc access (P1)
- `search_docs(query)` — returns titles + ids of matching project/workspace Pages.
- `read_doc(page_id)` — returns full plain-text content, scoped to the run's workspace/project.
- Both pass through the existing tool-approval policy layer.

### 6.4 Legible write-back (P1)
- `suggest_brief_note(text)` — Atlas proposes an addition to the Brief as an accept/edit suggestion (not a direct doc write).
- Accepting a suggestion appends it to the Brief.
- High-use `AgentMemory` facts can be promoted into the Brief via the same suggestion flow.

### 6.5 Visible capability (P0)
- "Atlas reads this" affordance on the Brief and Workspace Brief headers.
- Empty-Brief coaching copy: "Add project context here — Atlas uses it on every task."
- Atlas references the Brief in its output when it acted on it ("per your project Brief, …").

---

## 7. UX notes

- The Brief stays a normal collaborative doc — no new editor, no markdown exposed. The only additions are the "Atlas reads this" indicator and the empty-state coaching.
- Workspace Brief lives in Settings → AI (consistent with the unified AI settings; there is no `/settings/agents`).
- Honor existing conventions: header chrome baseline (56px), empty-state sidebar-icon pattern, motion `t-*` classes.

---

## 8. Technical approach (high level)

| Phase | Change | Primary files |
|---|---|---|
| 0 | Reliable backend Brief lookup (`is_brief` flag or name match) | `db/models/page.py`, migration, serializers, `brief-root.tsx` |
| 1 | Inject Project Brief into both prompt builders | `bgtasks/agent_dispatch_task.py` |
| 2 | Workspace Brief data + Settings → AI editor + injection | `agent_dispatch_task.py`, Settings AI page, brief editor reuse |
| 3 | `search_docs` + `read_doc` tools | `agent_dispatch_task.py` |
| 4 | `suggest_brief_note` + memory→Brief promotion | `agent_dispatch_task.py`, Brief suggestion UI |
| 5 | "Atlas reads this" UX + empty-state + persona nudge | brief components, `persona.py` |

**MVP = Phase 0 + 1 + 5.**

### Open technical decisions
1. **Brief identity:** add an `is_brief` boolean column (robust, needs a Coolify migration) vs. name-match only (zero migration, fragile to rename). *Recommendation: `is_brief` column.*
2. **Write-back path (Phase 4):** suggestion-based (ships safely now) vs. direct server-side doc edit (blocked by the Yjs binary-seed reconciliation problem and prod's lack of a live server — treat as a separate spike).

---

## 9. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Direct server-side Brief edits corrupt/duplicate Yjs content | High | v1 write-back is suggestion-based, not a live-doc write; direct edits are a separate spike using `/live/replace-document` reconciliation |
| Prod has no live server | Med | Read path doesn't need it; write-back v1 (suggestions) doesn't either |
| Brief grows large, blows the prompt budget | Med | Truncate with marker; full text via `read_doc` |
| Migration not auto-run on prod | Med | Run `python manage.py migrate` in Coolify after deploy |
| Brief renamed by user breaks name-based lookup | Low | Prefer the `is_brief` column |

---

## 10. Success metrics

- % of agent runs in projects that have a non-empty Brief (adoption).
- Reduction in repeated/clarifying agent comments where context was already in the Brief (quality).
- Acceptance rate of `suggest_brief_note` suggestions (legibility/trust).
- Qualitative: users report "Atlas knows this project."

---

## 11. Rollout

1. Ship Phase 0 + 1 behind the existing agent runtime; validate on the prod test workspace.
2. Add Phase 5 UX alongside so the capability is discoverable.
3. Ship Phase 2 (Workspace Brief), then Phase 3 (read tools).
4. Ship Phase 4a (suggestions); schedule the 4b direct-edit spike separately.

---

## 12. Future work

- Embedding/RAG over the full doc corpus for semantic retrieval.
- Per-project tool/permission scoping driven by Brief instructions.
- Brief versioning surfaced to the user ("Atlas's understanding changed on …").
- Direct, reconciled server-side Brief edits (4b spike outcome).
