# Plan 014: Give Atlas a personality (shared persona core, playful tone)

> **Executor instructions**: Introduce ONE shared persona string and route every
> Atlas voice surface through it. Keep all tool/routing/protocol instructions intact —
> only the _voice_ changes. Run the full suite (it's green: 332 passed) and web
> typecheck. If a STOP condition occurs, stop and report. Commit per the git workflow.
> SKIP updating plans/README.md. Audit claims against real tool output. Reply with the
> report format at the end.
>
> **Drift check (run first)**: `git diff --stat 0714cde538..HEAD -- apps/api/plane/app/views/agent/chat.py apps/api/plane/bgtasks/agent_dispatch_task.py apps/web/core/constants/atlas.ts`

## Status

- **Priority**: P2 · **Effort**: S · **Risk**: LOW (tone only; revertable)
- **Depends on**: none · **Category**: feature
- **Planned at**: commit `0714cde538`, 2026-06-10
- **Decision**: tone = **playful / more humor** (per maintainer).

## Why

Atlas's voice is generic ("helpful workspace companion") and duplicated across 4
server prompts + 1 web string. Give it a real personality — sharp, funny, proactive,
honest, kind — defined ONCE so it can't drift (the existing comments explicitly warn
against drift).

## Environment

- API suite needs Postgres+Redis (running locally; user/pw/db=plane, redis 6379) and the MAIN checkout's `.venv/bin/python`; env vars as SEPARATE tokens.
- Web typecheck: `pnpm install` (worktree, hardlinks) then `pnpm turbo run check:types --filter=web`.

## Current state

- `apps/api/plane/app/views/agent/chat.py:1408` — `atlas_persona` (chat), and `:92` `_CHAT_INTENT_SYSTEM_PROMPT` which opens with a "Default Buddy personality, always:" bullet block (lines ~95–100) followed by intent/tool-routing rules.
- `apps/api/plane/bgtasks/agent_dispatch_task.py:71` `_DEFAULT_SYSTEM_PROMPT` (task comments) and `:1143` `_DEFAULT_PAGE_COMMENT_SYSTEM_PROMPT` (page comments) — both start "You are a Dragon Fruit agent…" then give the `post_comment`/`post_page_comment` + `plan_next_steps`/`record_step` execution protocol.
- `apps/web/core/constants/atlas.ts:20` `ATLAS_IDENTITY.description` = "The workspace companion for docs, chat, tasks, and automations."

## Steps

### Step 1: Create the shared persona (`apps/api/plane/llm/persona.py`)

```python
ATLAS_PERSONA = (
    "You are Atlas, the DragonFruit workspace companion — a sharp, funny, trusted "
    "teammate, not a corporate bot. You have a real personality: quick wit, warmth, "
    "and opinions.\n"
    "- Concise and direct: lead with the answer; cut preamble, filler, and corporate hedging.\n"
    "- Genuinely funny: dry wit, a well-timed quip, the occasional playful aside — you "
    "sound like a clever colleague people actually like. Keep it natural and brief; never "
    "force a joke, never at the user's expense, and drop the humor entirely in errors, "
    "failures, or sensitive moments.\n"
    "- Proactive: resolve the problem, don't just list options — and surface the next step "
    "or the thing they didn't ask but should know.\n"
    "- Curious and sharp: when intent or context is missing, ask one focused follow-up "
    "instead of guessing. Question assumptions — including the user's — when something "
    "looks off, and say so plainly.\n"
    "- Honest: if you don't know, say so and give the next concrete step. Flag uncertainty, "
    "cite the workspace files/tasks/notes you drew from, and disagree (with a smile) when "
    "you think they're wrong.\n"
    "- Kind and warm, never sycophantic: encourage without flattering.\n"
    "- Smart: reason carefully, catch implications, anticipate the next need.\n"
    "Keep replies short unless depth is asked for. Don't dump chain-of-thought; share a "
    "brief rationale only when it helps."
)
```

### Step 2: Route chat through it (`chat.py`)

- `from plane.llm.persona import ATLAS_PERSONA`.
- Replace the inline `atlas_persona = ( "You are Atlas, the DragonFruit workspace companion. …" )` (lines ~1408–1412) with `atlas_persona = ATLAS_PERSONA`.
- In `_CHAT_INTENT_SYSTEM_PROMPT`, REMOVE the "Default Buddy personality, always:" bullet block (lines ~95–100) — ATLAS_PERSONA now owns the voice and is prepended before this prompt. KEEP everything else (intent classification, the create_document/search_workspace/create_task/create_sticky routing rules, the no-chain-of-thought line).

### Step 3: Route task + page-comment agents through it (`agent_dispatch_task.py`)

- `from plane.llm.persona import ATLAS_PERSONA`.
- `_DEFAULT_SYSTEM_PROMPT`: make it `ATLAS_PERSONA + "\n\n" + <task framing>` where the task framing keeps the substance: "You're participating in a task thread like a real teammate. Read the task description and the most recent comments, then reply with a single comment that moves the task forward — call the `post_comment` tool; produce no other output." + the existing mandatory execution protocol (plan_next_steps / record_step phases / result+evidence+next_action). Drop the old "You are a Dragon Fruit agent" opener (ATLAS_PERSONA replaces it).
- `_DEFAULT_PAGE_COMMENT_SYSTEM_PROMPT`: same treatment — ATLAS_PERSONA + the page-thread framing (@-mention, read thread + page excerpt, single comment via `post_page_comment`, no other output) + its execution-protocol line.
- Keep the tool names and protocol EXACTLY; only the voice/opening changes.

### Step 4: Mirror the voice in the web description (`atlas.ts`)

Change `description` to: `"Your sharp, proactive workspace companion — concise, honest, a little dry humor. Asks the right questions, resolves problems, gets out of your way."`

## Verification

| Purpose       | Command                                                                                                        | Expected             |
| ------------- | -------------------------------------------------------------------------------------------------------------- | -------------------- |
| API suite     | (env prefix) `.venv/bin/python -m pytest plane/tests/ -q --tb=line \| tail -1` from apps/api                   | 0 failed (still 332) |
| API lint      | `.venv/bin/ruff check plane/llm/persona.py plane/app/views/agent/chat.py plane/bgtasks/agent_dispatch_task.py` | clean                |
| Web typecheck | `pnpm turbo run check:types --filter=web`                                                                      | exit 0               |

## Done criteria

- [ ] `apps/api/plane/llm/persona.py` defines `ATLAS_PERSONA`; chat.py + agent_dispatch_task.py both import it
- [ ] No duplicated personality prose remains (the old `atlas_persona` literal and the "Default Buddy personality" block are gone)
- [ ] All tool/routing/protocol instructions preserved verbatim (create_document, search_workspace, post_comment, post_page_comment, plan_next_steps, record_step)
- [ ] API suite still 0 failed; ruff clean on changed files; web typecheck exit 0
- [ ] `atlas.ts` description updated
- [ ] Only the 4 files (+ new persona.py) changed (`git status`)
- [ ] Report the suite result + confirm tool/protocol text is unchanged

## STOP conditions

- A test asserts on the old persona/prompt text and fails — report it (don't gut the test; the maintainer decides whether to update the assertion).
- Threading ATLAS_PERSONA into the task prompts would change a tool name or the execution-protocol contract — back out that part; only the voice changes.
- Importing `plane.llm.persona` creates a circular import — put the constant somewhere neutral and report.

## Maintenance notes

- One persona, one place — future voice tweaks happen in `persona.py` only. The web
  `description` is a user-facing mirror; keep it in spirit, not verbatim.
- Tone is dialed "playful"; if it reads as too much in practice, soften the "Genuinely
  funny" bullet — that's the humor dial.
