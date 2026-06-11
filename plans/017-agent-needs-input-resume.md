# Plan 017: Agent runs that can ask for help, pause, and resume (+ approve-to-execute, + events)

> **Executor instructions**: Backend-only. Build in steps, run the API suite after
> each, COMMIT per step. The LLM loop is mocked in tests (see existing
> `atlas_baseline` tests) — NEVER hit a real model. If a STOP condition occurs, stop
> and report. SKIP updating plans/README.md. Audit claims against real tool output.
> Reply with the report format at the end.
>
> **Drift check (run first)**: `git diff --stat b29dc0b7ae..HEAD -- apps/api/plane/db/models/agent.py apps/api/plane/bgtasks/agent_dispatch_task.py`

## Status

- **Priority**: P1 (foundation for the Mac-app/chat delivery in 018) · **Effort**: L · **Risk**: MED-HIGH (core agent runtime; mocked-LLM tests are the safety net)
- **Depends on**: none · **Category**: feature
- **Planned at**: commit `b29dc0b7ae`, 2026-06-11
- **Pairs with**: plan 018 (Mac app + Atlas chat surface these events and let the human respond)

## Why

Today an agent run is one synchronous Celery task that runs to completion: it can only "ask for help" by posting a comment, there's no `needs_input` state, no resume, and the `ask` tool policy just denies-and-tells the model (`_wrap_tool_with_approval_gate`). To support "Atlas works → needs help → you answer → it continues" and "Atlas wants to run a sensitive tool → you approve → it runs", runs need a **pause/resume lifecycle** and to **emit events** the delivery layer (018) can surface.

## Design (pragmatic resume — read this first)

The LLM message history is NOT serialized mid-loop. So "resume" = persist what's needed, end the task, and on the human's response **re-dispatch a fresh `provider.run()` re-grounded** on: the original task context + the run's recorded steps (`run.tool_calls` / record_step entries) + the human's answer or the approved tool's result. This is re-grounding, not true continuation — acceptable and far simpler than serializing the loop. Call this out in the run's context so the model knows it's continuing.

## Current state (confirmed)

- `apps/api/plane/db/models/agent.py:385` `AgentRun`: `STATUS_CHOICES = pending|running|completed|failed|cancelled`; has `tool_calls` (JSON list of `{name, arguments, result}`), `iterations`, `cancel_requested`, telemetry.
- `apps/api/plane/bgtasks/agent_dispatch_task.py:110` `dispatch_agent_event(agent_id, issue_id, trigger_event)` builds tools (`base_tools` + MCP), calls `provider.run(..., max_iterations=...)` (line ~188), then finalises status.
- `_wrap_tool_with_approval_gate` (line 308): `ask` tools return `{approval_required: true, "stop and request approval"}` — deny-and-tell, no real pause.
- `_make_record_step_tool`, `_make_post_comment_tool`, `_post_comment_as_bot` exist.

## Steps

### Step 1: Run lifecycle fields + status (commit 1)

`agent.py` `AgentRun`:

- Add `"needs_input"` to `STATUS_CHOICES`.
- Add `pending_request = models.JSONField(null=True, blank=True)` — shape `{ "kind": "question"|"approval", "message": str, "tool": str|None, "arguments": dict|None }`.
- (Reuse `tool_calls` as the resume context; no new context field needed.)
- Migration: `cd apps/api && python manage.py makemigrations` (review the generated file). **Verify**: migration applies in tests (`--create-db` run); suite still passes.

### Step 2: `request_help` tool (agent explicitly asks) (commit 2)

In `agent_dispatch_task.py`, add `_make_request_help_tool(*, agent, issue, run)`: params `{ "question": str }`. Handler:

- Post the question as a bot comment (`_post_comment_as_bot`).
- Set `run.pending_request = {kind:"question", message:question}`, `run.status = "needs_input"`, save.
- Return a sentinel string that ENDS the loop cleanly (e.g. raise a small `AgentPaused` exception caught by the dispatcher, OR return a result the loop treats as terminal — match how the loop currently terminates; the simplest is a sentinel the dispatcher checks for after `provider.run`). Register it in `base_tools`, and mention it in `_DEFAULT_SYSTEM_PROMPT`: _"If you're blocked or missing context, call `request_help` with a specific question instead of guessing — the run pauses until the user replies."_
  **Verify**: a mocked-LLM test where the model calls `request_help` → run.status == "needs_input", a comment exists, the loop stopped (no further tool calls).

### Step 3: Approve-to-execute (replace deny-and-tell) (commit 3)

Change `_wrap_tool_with_approval_gate` so an `ask`-gated tool, when first called, **persists** `run.pending_request = {kind:"approval", message:"Atlas wants to run <tool>", tool, arguments}`, sets `run.status="needs_input"`, posts a short comment, and pauses the loop (same sentinel/exception as Step 2) — instead of returning "stop and ask". The actual tool handler is invoked later on approval (Step 4).
**Verify**: mocked test — an `ask` tool call → run needs_input + pending_request.kind == "approval"; the tool did NOT execute.

### Step 4: Resume endpoint + task (commit 4)

- New `resume_agent_run` Celery task `(run_id, *, human_response: str|None, approved: bool|None)`:
  - Guard: run must be `needs_input`.
  - **question**: append the human_response as context; set status=running; re-dispatch the loop (call a shared `_run_agent_loop(run, resume_note=...)` factored out of `dispatch_agent_event`) re-grounded on `run.tool_calls` + the answer.
  - **approval**: if `approved`, execute the real (unwrapped) pending tool with `pending_request.arguments`, append its result to `tool_calls`, then resume the loop; if not approved, record "user declined" and let the loop continue/finish.
  - Clear `pending_request` on resume.
- New API endpoint `POST /api/workspaces/{slug}/agent-runs/{run_id}/respond/` (in `agent` views/urls) → validates the user can act on the run's workspace, accepts `{response?, approved?}`, calls `resume_agent_run.delay(...)`. (018 calls this.)
- Refactor: extract the loop body of `dispatch_agent_event` into `_run_agent_loop(run, *, resume_note=None)` so both initial dispatch and resume share it. Keep behavior identical for the non-resume path.
  **Verify**: mocked test — request_help → respond(response="do X") → loop runs again and completes; approval → respond(approved=True) → pending tool executes then loop continues. Full suite still 0 failed.

### Step 5: Emit events for delivery (commit 5)

When a run (a) posts a comment, (b) enters `needs_input`, or (c) `completed`/`failed`, create a **Notification** (reuse `plane/db/models/notification.py`) targeted at the run's relevant human(s) — the issue assignee(s)/creator and whoever last @-mentioned or assigned Atlas — with a payload identifying the run, issue, kind (`needs_input`|`completed`|`comment`), and message. This is what 018's Mac app + chat poll. Keep it best-effort (never fail the run if notification creation throws).
**Verify**: mocked test — a run entering needs_input creates a Notification row for the expected user with the run id in the payload.

## Scope

**In scope**: `apps/api/plane/db/models/agent.py` (+ migration), `apps/api/plane/bgtasks/agent_dispatch_task.py`, `apps/api/plane/app/views/agent/*` + `urls/agent.py` (respond endpoint), notification creation helper, `apps/api/plane/tests/contract|unit/*` (new tests).
**Out of scope**: the Mac app / web chat UI (that's 018); the page-comment agent path (apply the same pattern later if it works for issues); changing existing tool behaviors beyond the approval-gate rewrite.

## Git workflow

- Branch: `advisor/017-agent-needs-input-resume`. Commit per step. Do NOT push/PR.

## Done criteria

- `needs_input` status + `pending_request` field + migration; `request_help` tool; approve-to-execute; `resume_agent_run` + `/agent-runs/{id}/respond/`; Notification emitted on needs_input/completed.
- Mocked-LLM tests cover: request_help→pause, approval→pause, resume(question)→continue, resume(approval)→execute+continue, needs_input→notification. Full suite 0 failed; ruff clean.
- The non-resume dispatch path behaves exactly as before (regression-checked by existing agent tests).
- Only in-scope files changed.

## STOP conditions

- The loop has no clean way to terminate early on a sentinel/exception without corrupting telemetry finalisation — report the loop structure; don't force it.
- "Resume by re-grounding" proves insufficient for a real case (e.g. the model loses critical mid-loop state) — report; we may need to persist more context.
- Extracting `_run_agent_loop` would change the non-resume behavior — stop; keep the initial path identical.
- Notification model's required fields don't fit agent events cleanly — report the shape; don't shoehorn.

## Maintenance notes

- Resume is re-grounding, not serialized continuation — document it. If runs get long, persist a compact transcript on the run for richer resumes.
- Concurrency: guard `respond` so two replies can't double-resume (check status==needs_input under a row lock).
- 018 depends on Step 4's endpoint + Step 5's notifications.
