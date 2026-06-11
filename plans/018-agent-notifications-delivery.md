# Plan 018: Surface agent follow-ups in the Atlas Mac app + chat, and let the user respond

> **Executor instructions**: Builds on 017 (the run lifecycle + `/agent-runs/{id}/respond/`
>
> - agent Notifications). Two surfaces: the Atlas **Mac app** (Swift) and the **Atlas
>   chat** (web). Backend adds one read endpoint. Verify API with the suite; Mac app
>   with `xcodebuild`; web with typecheck/build/lint. No full runtime harness — reviewer
>   smoke-tests. If a STOP condition occurs, stop and report. SKIP updating
>   plans/README.md. Reply with the report format at the end.
>
> **Drift check (run first)**: confirm 017 is merged (the `respond` endpoint + `needs_input` status + agent Notifications exist) — if not, STOP: 018 depends on it.

## Status

- **Priority**: P1 · **Effort**: M–L · **Risk**: MED (prod UI, Mac + web; can't fully runtime-verify → reviewer smokes)
- **Depends on**: **017** (must be merged) · **Category**: feature
- **Planned at**: commit `b29dc0b7ae`, 2026-06-11
- **Transport decision**: **polling**, not push. The live/WebSocket server isn't deployed in prod (per the deployment notes), and the Mac app already polls (calendar/meetings). v1 = poll on the existing cadence; a push/WebSocket upgrade is a later option.

## Why

017 makes runs pause for input and emit Notifications, but nothing surfaces them where the user is: the Atlas Mac app only does interactive chat (no notification/agent-run polling), and Atlas chat is purely conversational. This plan delivers "Atlas needs you on TASK-123 / Atlas finished" to the Mac app + chat and lets the user **answer or approve inline**, which calls back into 017's resume.

## Backend (commit 1): the "agent inbox" read endpoint

Add `GET /api/workspaces/{slug}/agent-runs/inbox/` (in `agent` views/urls) → returns the current user's actionable agent runs: those with `status="needs_input"` (the question/approval from `pending_request`) plus recently `completed`/`failed` runs that named/assigned the user, each with `{ run_id, issue: {id, sequence_id, name}, kind, message, status, updated_at }`. Scope to runs whose issue the user can access. Keep it lean (cap ~25, newest first).

- (The `respond` endpoint already exists from 017: `POST /agent-runs/{run_id}/respond/ {response?, approved?}`.)
  **Verify**: a contract test — a `needs_input` run shows up in inbox for the right user with its `pending_request.message`; `respond` resumes it (reuse 017's resume test path).

## Mac app (commit 2): Atlas needs you

`apps/Copilot/Sources`:

- `APIClient.swift`: add `fetchAgentInbox(workspaceSlug) -> [AgentInboxItem]` (GET the inbox endpoint) and `respondToAgentRun(workspaceSlug, runId, response:String?, approved:Bool?)` (POST respond). Add the `AgentInboxItem` Codable.
- `MeetingStore`/the app's existing poll timer already drives calendar polling — add an agent-inbox poll on the same cadence (or a slightly slower one). On a NEW `needs_input` item (diff against last-seen ids), fire a **macOS `UserNotifications` local notification** ("Atlas needs you on TASK-123: <question>") and badge/surface it in the menu-bar popover. (Mic/notification permission: request `UNUserNotificationCenter` authorization once, alongside the existing TCC permissions — see the permission flow.)
- A small popover view: list inbox items; for a `question` item, a text field → "Send" calls `respondToAgentRun(response:)`; for an `approval` item, "Approve"/"Decline" → `respondToAgentRun(approved:)`. On success, optimistically remove the item.
  **Verify**: `cd apps/Copilot && xcodebuild -project DragonFruitMini.xcodeproj -scheme DragonFruitMini -configuration Debug -derivedDataPath .build/xcode build CODE_SIGNING_ALLOWED=NO` → `** BUILD SUCCEEDED **`.

## Atlas chat (commit 3): follow-ups inline

`apps/web/core/components/agent-chat/` (the chat drawer) + the AI dispatch listener:

- Poll the inbox endpoint (reuse the app's data layer / SWR) and render a compact **"Atlas needs you" strip** at the top of the chat drawer when there are `needs_input` items: each shows the issue + question, with an inline reply box (question) or Approve/Decline (approval) → calls `respond`. Completed-run items render as a dismissible "Atlas finished TASK-123" line.
- Keep it additive and scoped to the chat drawer; don't change the conversational flow.
  **Verify**: `pnpm turbo run check:types --filter=web` exit 0; `pnpm check:lint` no new errors.

## Scope

**In scope**: `apps/api/plane/app/views/agent/*` + `urls/agent.py` (inbox endpoint) + a contract test; `apps/Copilot/Sources/{APIClient.swift, + a small inbox view, poll wiring, UserNotifications}`; `apps/web/core/components/agent-chat/*` (+ inbox poll/strip). Reuse 017's `respond` endpoint + Notifications.
**Out of scope**: WebSocket/push (poll for v1); the page-comment agent; redesigning the chat drawer; Mac app deep-linking into the web issue (a "View task" link that opens the browser is enough).

## Git workflow

- Branch: `advisor/018-agent-notifications-delivery`. Commit per surface (backend, mac, web). Do NOT push/PR.

## Done criteria

- `GET /agent-runs/inbox/` returns the user's needs_input + recent completed runs (contract test passes); full API suite 0 failed.
- Mac app builds (`** BUILD SUCCEEDED **`); polls the inbox, fires a local notification on new needs_input, and can respond/approve (wired to `respond`).
- Web chat shows a needs-you strip and can respond inline; `check:types --filter=web` + lint green.
- Only in-scope files changed; reuses 017's endpoint + notifications (no duplicate lifecycle logic).
- Report the smoke steps.

## STOP conditions

- 017 isn't merged (no `respond` endpoint / `needs_input` / agent Notifications) — STOP.
- The Mac app's poll timer can't take another endpoint cleanly, or `UserNotifications` authorization conflicts with the existing TCC flow — report (don't fight the permission system).
- The chat drawer has no place for a non-conversational strip without restructuring — render the items as system messages in the thread instead, and report.
- Mac build needs signing/derived-data the worktree can't provide — report; ship backend + web and leave the Mac surface for a `pnpm mac:dev` session.

## Maintenance notes

- Polling cadence is a tradeoff (latency vs load) — start conservative (e.g. the calendar cadence) and tune. A later push upgrade would reuse the same inbox payload.
- The Mac local-notification needs `UNUserNotificationCenter` auth — add to the onboarding permission set, not a surprise prompt mid-use.
- When 017's page-comment agent gains the same lifecycle, the inbox endpoint should include those runs too.
