# Plan 027: Ship a private, per-user Momentum gamification system

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat c05b67c942..HEAD -- \
>   apps/api/plane/db/models apps/api/plane/db/migrations \
>   apps/api/plane/db/management/commands apps/api/plane/utils \
>   apps/api/plane/app/views apps/api/plane/app/urls/workspace.py \
>   apps/api/plane/tests apps/web/core/components/home \
>   apps/web/core/services apps/web/app/'(all)'/__preview plans
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. A semantic
> mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L (multi-day; backend ledger + API + web surface + backfill)
- **Risk**: MED (new persistent counters and write-path signals must remain
  idempotent and must never break task/doc writes)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `c05b67c942`, 2026-07-15

## Why this matters

DragonFruit already calculates weighted activity, streaks, and a 20-week
heatmap, but the calculation is workspace-wide rather than personal and the
component is no longer mounted on Home. That makes the current data unsuitable
as a reward system: one person's activity changes everyone else's streak, and
the result is not visible in the main product flow. This plan turns that unused
foundation into **Momentum**, a private, workspace-scoped progression system
that rewards meaningful human actions with XP, levels, streaks, and
achievements.

The V1 deliberately avoids a leaderboard, monetary rewards, and rewards for
comments/edits. Those mechanics invite spam and turn project work into employee
surveillance. The product goal is personal momentum and habit feedback, not
ranking coworkers.

## Product contract (do not change without product approval)

### Vocabulary and ownership

- The user-facing feature is named **Momentum**.
- The unit is **XP**; use `points` in storage/API fields and render it as `XP`.
- Progress is scoped to `(workspace, user)`. The API only exposes the requesting
  user's progress. There is no endpoint accepting an arbitrary user ID.
- Bots never earn XP. Automated/background actions without an authenticated
  human request actor never earn XP.
- Deleting, archiving, or reopening a source object does not remove XP. The
  event ledger is immutable; reversals and admin adjustments are future work.

### V1 earning rules

Keep these in one backend rules table; do not duplicate point values in the web
app.

| Event key        | Award | Source identity | Award rule                                                       |
| ---------------- | ----: | --------------- | ---------------------------------------------------------------- |
| `task_created`   |  5 XP | task UUID       | First human creation only                                        |
| `task_completed` | 20 XP | task UUID       | First transition from a non-completed state to a completed state |
| `doc_created`    | 15 XP | page UUID       | First human creation of a `Page` only                            |

Important edge behavior:

- A task created directly in a completed state earns only `task_created`, not
  `task_completed`.
- Reopening and recompleting a task never earns the completion award twice.
- A single task may legitimately earn both `task_created` and
  `task_completed` over its lifetime.
- Folder, PDF, sheet, and whiteboard pages count as `doc_created` in V1 because
  `Page` is DragonFruit's shared workspace artifact. If product wants doc-only
  scoring, stop and get that decision before coding.
- Agent-authored tasks/pages, seeded demo data, imports running without a human
  request actor, edits, comments, reactions, views, and visits award nothing.
- Do not add daily caps in V1. Idempotent per-source awards, private progress,
  and the absence of transferable value are the initial abuse controls.

### Levels

Levels are derived from total points and are not stored as an independently
mutable counter:

| Level | Name    | Minimum XP |
| ----: | ------- | ---------: |
|     1 | Seed    |          0 |
|     2 | Sprout  |        100 |
|     3 | Sapling |        250 |
|     4 | Bloom   |        500 |
|     5 | Grove   |      1,000 |
|     6 | Orchard |      2,000 |
|     7 | Harvest |      3,500 |

At Harvest, `next_level` and `next_threshold` are `null`, and progress renders
as 100%. Put this table beside the earning rules on the backend and return the
resolved current/next level metadata from the API.

### Streak semantics

- A local calendar day is active when it contains at least one awarded event.
- Convert `occurred_at` with `User.user_timezone`; fall back to `UTC` only if a
  legacy/invalid value somehow reaches the service.
- Current streak includes consecutive active days ending today. If today is
  empty but yesterday was active, preserve the streak for the fresh-morning
  grace behavior already used by the existing endpoint.
- A gap before yesterday resets current streak to zero. Longest streak never
  decreases.
- Backfilled/out-of-order events must trigger a deterministic profile rebuild;
  do not try to patch streaks incrementally for historical dates.

### V1 achievements

Achievements unlock once and do not grant bonus XP:

| Key            | Title         | Condition                              |
| -------------- | ------------- | -------------------------------------- |
| `first_task`   | First step    | 1 `task_created`                       |
| `first_finish` | Finisher      | 1 `task_completed`                     |
| `first_doc`    | Documentarian | 1 `doc_created`                        |
| `tasks_10`     | Task maker    | 10 `task_created`                      |
| `finishes_10`  | Closer        | 10 `task_completed`                    |
| `docs_10`      | Scribe        | 10 `doc_created`                       |
| `streak_3`     | On a roll     | 3-day longest streak                   |
| `streak_7`     | Full week     | 7-day longest streak                   |
| `streak_30`    | Deep roots    | 30-day longest streak                  |
| `balanced_10`  | Builder       | 10 docs created and 10 tasks completed |

The API returns all definitions with `progress`, `target`, and `unlocked_at`, so
the web app can render both earned and locked achievements without duplicating
condition logic.

### Explicitly out of V1

- Workspace/team leaderboards, public profiles, or comparing members.
- Redeemable rewards, billing discounts, badges in comments, or social sharing.
- Admin-authored rules, custom point values, seasons, quests, streak freezes,
  negative points, manual adjustments, or event reversals.
- Push notifications and XP toasts on every write. The Home card is the only V1
  presentation surface.
- Mobile and Copilot UI. Their existing activity-summary contracts must continue
  working until a separate cross-platform plan replaces them.
- Analytics/telemetry beyond the durable event ledger.

## Current state

### Existing backend foundation

- `apps/api/plane/app/views/workspace/home.py:23-27` seeds an `activity` home
  preference:

  ```python
  # Legacy widget keys are deliberately absent — the section-based
  # home view replaced them.
  _SEEDED_KEYS = ["inbox", "my_tasks", "favorites", "recent_activity", "activity", "agent_cost"]
  ```

- `apps/api/plane/app/views/workspace/home.py:84-145` computes activity from all
  pages and issues in the workspace. Neither queryset filters by the requesting
  user:

  ```python
  pages = Page.objects.filter(
      workspace__slug=slug,
      deleted_at__isnull=True,
      created_at__gte=since,
  )
  issues = Issue.issue_objects.filter(
      workspace__slug=slug,
      created_at__gte=since,
  )
  ```

- `apps/api/plane/app/views/workspace/home.py:166-186` contains the streak
  behavior to preserve, including the empty-today grace period.
- `apps/api/plane/db/models/user.py:115-120` provides both the bot flag and the
  user's IANA timezone:

  ```python
  is_bot = models.BooleanField(default=False)
  user_timezone = models.CharField(max_length=255, default="UTC", choices=USER_TIMEZONE_CHOICES)
  ```

- `apps/api/plane/db/models/issue.py:194-269` already synchronizes
  `completed_at` when `state.group` enters/leaves `completed`. The new signal
  should observe the transition; do not reimplement or alter this model logic.
- Model signals in `apps/api/plane/db/models/agent.py:480-616` show the local
  convention: string senders to avoid import cycles, early exits, and
  `transaction.on_commit(...)` so side effects run after the source write.

### Existing web foundation

- `apps/web/core/components/home/sections/activity-heatmap-section.tsx:20-99`
  already has the fixed 20-week grid packing and intensity helpers. Reuse them.
- The same component currently fetches `activity-summary` every 60 seconds and
  renders current/longest streak cards at lines 139-149 and 277-288.
- `apps/web/core/components/home/root.tsx:64-68` mounts Recent docs, My tasks,
  Favorites, and Recent activity, but not `ActivityHeatmapSection`.
- `apps/web/core/services/home-preferences.service.ts:12-37` contains the old
  activity response types. Leave that old endpoint and its types in place for
  compatibility; introduce a separate typed gamification service.
- `apps/web/app/(all)/__preview/activity/page.tsx` is a login-free visual fixture
  for the old card. Convert its sample payload and component to Momentum while
  keeping the route path stable for reviewers.

### Existing verification conventions

- Root `pnpm test:api` runs the Django pytest suite.
- Targeted API tests live under `apps/api/plane/tests/unit/` and
  `apps/api/plane/tests/contract/app/`.
- The web app has no product-component test runner. Its enforceable gates are
  `pnpm --filter=web check:types` and `pnpm --filter=web build`; the preview route
  is the visual regression fixture.
- Icons must come from the Solar icon system through the local shims or
  `@solar-icons/react`; do not introduce another icon family.

## Target architecture

```text
Human Page/Issue save
        │
        ▼
pre/post-save signal (fast guards; never awards bots/background writes)
        │ transaction.on_commit(..., robust=True)
        ▼
award_gamification_event(...)
        │ one atomic transaction + unique source constraint
        ├── immutable GamificationEvent ledger
        ├── locked GamificationProfile aggregate
        └── one-time UserAchievement unlock rows
                         │
                         ▼
GET /api/workspaces/{slug}/gamification/me/
                         │
                         ▼
Home → MomentumSection (level, XP, streak, achievements, heatmap, recent XP)
```

## Commands you will need

| Purpose          | Command                                                                                                              | Expected on success                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Drift            | `git diff --stat c05b67c942..HEAD -- <in-scope paths>`                                                               | Reviewable output; no unexplained semantic drift |
| Migration check  | `cd apps/api && python manage.py makemigrations --check --dry-run`                                                   | `No changes detected`, exit 0                    |
| Targeted backend | `cd apps/api && python -m pytest plane/tests/unit/gamification plane/tests/contract/app/test_gamification_app.py -q` | All new tests pass                               |
| Full backend     | `pnpm test:api`                                                                                                      | All tests pass                                   |
| Web types        | `pnpm --filter=web check:types`                                                                                      | Exit 0, no TypeScript errors                     |
| Web build        | `pnpm --filter=web build`                                                                                            | Exit 0; production bundle created                |
| Repo checks      | `pnpm check`                                                                                                         | Exit 0                                           |

Do not run formatters until the implementation is complete and the diff has
been reviewed. `pnpm fix` mutates many files in a dirty working tree; prefer
targeted formatting of the files owned by this plan.

## Suggested executor toolkit

- Use the `claude-ui-polish` skill, if available, only for the final visual pass
  on `MomentumSection`; the product contract and backend architecture in this
  plan remain authoritative.
- Use the existing activity preview route for visual iteration. Do not invent a
  second design system or add a charting dependency for the heatmap.

## Scope

### In scope (the only source files to modify or create)

Backend:

- `apps/api/plane/db/models/gamification.py` (create)
- `apps/api/plane/db/models/__init__.py`
- `apps/api/plane/db/migrations/0163_gamification.py` (create; use the next live
  migration number if 0163 is occupied after drift review)
- `apps/api/plane/utils/gamification.py` (create)
- `apps/api/plane/db/management/commands/backfill_gamification.py` (create)
- `apps/api/plane/app/views/workspace/gamification.py` (create)
- `apps/api/plane/app/views/workspace/home.py`
- `apps/api/plane/app/views/__init__.py`
- `apps/api/plane/app/urls/workspace.py`
- `apps/api/plane/tests/unit/gamification/__init__.py` (create)
- `apps/api/plane/tests/unit/gamification/test_gamification_service.py` (create)
- `apps/api/plane/tests/unit/gamification/test_gamification_signals.py` (create)
- `apps/api/plane/tests/unit/gamification/test_backfill_gamification.py` (create)
- `apps/api/plane/tests/contract/app/test_gamification_app.py` (create)

Web:

- `apps/web/core/services/gamification.service.ts` (create)
- `apps/web/core/services/home-preferences.service.ts` (update only the home
  section-key union; retain the legacy activity types/method)
- `apps/web/core/components/home/sections/activity-heatmap-section.tsx` (rename
  to `momentum-section.tsx`; do not keep two copies of the grid helpers)
- `apps/web/core/components/home/sections/index.ts`
- `apps/web/core/components/home/root.tsx`
- `apps/web/app/(all)/__preview/activity/page.tsx`

Planning index:

- `plans/README.md` (status row only)

### Out of scope (do not touch even if related)

- `apps/mobile/**` and `apps/Copilot/**` — cross-platform surfaces are deferred.
- `apps/api/plane/app/views/workspace/home.py`'s existing
  `WorkspaceActivitySummaryEndpoint` and its URL — retain compatibility.
- Existing task/page serializer response shapes — do not inject gamification
  fields into mutation responses.
- `apps/api/plane/db/models/issue.py` completion logic and
  `apps/api/plane/bgtasks/issue_activities_task.py` activity logging.
- Notification models/tasks, WebSockets, Redis, and Celery. V1 award writes are
  local `on_commit` callbacks and do not need another delivery system.
- Shared UI packages. Build the card from existing web tokens/primitives.
- New npm/Python dependencies.

## Git workflow

- Work directly on `main`; this repository explicitly forbids task branches and
  worktrees.
- Preserve all pre-existing uncommitted changes. Before editing, record
  `git status --short`; after every step verify that only the in-scope paths you
  intentionally changed were added to your work.
- Do not commit or push until the user says the work is complete. Pushing
  `origin/main` deploys the product.
- When authorized to commit, follow the recent imperative style, e.g.
  `Ship per-user Momentum gamification`.

## Steps

### Step 1: Add the durable, constrained gamification schema

Create `apps/api/plane/db/models/gamification.py` with three `BaseModel`
subclasses:

1. `GamificationEvent`
   - `workspace` FK → `Workspace`, CASCADE,
     `related_name="gamification_events"`.
   - `user` FK → auth user, CASCADE,
     `related_name="gamification_events"`.
   - `event_type` `CharField(max_length=32)`.
   - `points` positive integer field (the awarded snapshot, not dynamically
     recomputed from today's rules).
   - `source_type` `CharField(max_length=32)` (`issue` or `page`).
   - `source_id` UUID field.
   - `occurred_at` DateTime field and `local_date` Date field.
   - `rule_version` positive small integer, default 1.
   - `metadata` JSON field, default dict.
   - Unique constraint over
     `(workspace, event_type, source_type, source_id)` — deliberately excluding
     `user`. A task completion is awardable once in the workspace even if a
     second person later reopens and recompletes it. This is the final
     duplicate-award defense.
   - Indexes for `(workspace, user, -occurred_at)`,
     `(workspace, user, local_date)`, and `(event_type, source_id)`.

2. `GamificationProfile`
   - `workspace` and `user` FKs with a unique constraint on the pair.
   - `total_points` non-negative integer, default 0.
   - `event_counts` JSON field, default dict, containing only the three event
     keys and integer counts.
   - `current_streak`, `longest_streak` non-negative integers, default 0.
   - `last_active_date` nullable Date field.
   - Index `(workspace, user)`.
   - Do not store level; derive it from `total_points`.

3. `UserAchievement`
   - `workspace`, `user`, `achievement_key`, `unlocked_at`, and
     `progress_snapshot` JSON.
   - Unique constraint on `(workspace, user, achievement_key)`.
   - Index `(workspace, user, -unlocked_at)`.

Export all three models from `apps/api/plane/db/models/__init__.py`. Generate a
single migration that creates the tables and, in the same migration, renames
active `WorkspaceHomePreference.key == "activity"` rows to `"momentum"` with
the collision-safe pattern used by
`apps/api/plane/db/migrations/0149_rename_home_preference_on_my_plate_to_my_tasks.py`.
The reverse migration renames `momentum` back to `activity`.

Update `_SEEDED_KEYS` in `home.py` to seed `momentum` instead of `activity`.

**Verify**:

```bash
cd apps/api && python manage.py makemigrations --check --dry-run
```

Expected: `No changes detected`; exit 0.

### Step 2: Implement one transactional scoring and rebuild service

Create `apps/api/plane/utils/gamification.py`. It is the only module allowed to
know point values, level thresholds, achievement definitions, and streak math.
Expose typed constants/enums plus these functions (names may vary only to match
local Python conventions):

- `award_gamification_event(*, workspace_id, user_id, event_type, source_type,
source_id, occurred_at, metadata=None) -> AwardResult`
- `rebuild_gamification_profile(*, workspace_id, user_id) ->
GamificationProfile`
- `build_gamification_summary(*, workspace, user, days=365) -> dict`

`award_gamification_event` must:

1. Reject unknown event/source types before writing.
2. Load the user; return a no-op result for missing, inactive, or bot users.
3. Confirm an active `WorkspaceMember` exists for `(workspace, user)`. Do not
   award a user into a workspace they cannot access.
4. Convert `occurred_at` to `local_date` using `user.user_timezone`.
5. Enter `transaction.atomic()` and create the immutable event with the point
   value snapshot. If the unique source constraint already exists, return
   `created=False` without changing counters or achievements.
6. Lock/create the profile with `select_for_update`, increment total points and
   the matching event count, and update the streak. Use `F()` expressions or a
   locked in-memory row consistently; do not perform unlocked read-modify-write.
   For normal same-day/next-day events, update incrementally. If `local_date`
   predates `last_active_date`, recompute the streak from the ledger before
   evaluating achievements; never let an out-of-order event manufacture a
   streak unlock.
7. Evaluate every achievement definition and `get_or_create` newly satisfied
   rows. Return the new unlock keys in `AwardResult` for future callers, but do
   not add a notification surface in V1.

`rebuild_gamification_profile` is the authoritative path for backfills and
repairs. Aggregate all of that user's ledger rows, recalculate totals/counts,
compute streaks from distinct sorted `local_date` values, update the profile in
one locked transaction, and idempotently reconcile achievement rows. Never
delete already-unlocked achievements during a rebuild.

`build_gamification_summary` must return this stable JSON shape:

```json
{
  "points": {
    "total": 315,
    "level": 3,
    "level_name": "Sapling",
    "level_floor": 250,
    "next_level": 4,
    "next_level_name": "Bloom",
    "next_threshold": 500,
    "progress": 0.26
  },
  "streak": {
    "current": 4,
    "longest": 9,
    "last_active_date": "2026-07-15"
  },
  "counts": {
    "task_created": 12,
    "task_completed": 7,
    "doc_created": 8
  },
  "rules": {
    "task_created": 5,
    "task_completed": 20,
    "doc_created": 15
  },
  "achievements": [
    {
      "key": "first_task",
      "title": "First step",
      "description": "Create your first task.",
      "progress": 1,
      "target": 1,
      "unlocked_at": "2026-07-15T12:00:00Z"
    }
  ],
  "daily_buckets": [
    {
      "date": "2026-07-15",
      "points": 25,
      "events": 2,
      "task_created": 1,
      "task_completed": 1,
      "doc_created": 0
    }
  ],
  "recent_events": [
    {
      "id": "uuid",
      "event_type": "task_completed",
      "points": 20,
      "source_type": "issue",
      "source_id": "uuid",
      "occurred_at": "2026-07-15T12:00:00Z"
    }
  ]
}
```

Return a contiguous daily series, oldest first, bounded to 365 days, and at
most 20 recent events. Empty users receive a zeroed profile, all locked
achievement definitions, and the contiguous empty bucket series. Do not expose
event metadata in the API. The summary builder must also return an effective
`current` streak of zero when `last_active_date` is older than yesterday; the
stored counter can otherwise become stale while the user is inactive.

Write service unit tests before wiring signals. Include exact threshold tests
at 99/100, 249/250, and max level; duplicate award; membership rejection; bot
rejection; local dates on both sides of UTC midnight; today/yesterday grace;
gap reset; longest streak; all ten achievement conditions; and deterministic
out-of-order rebuild.

**Verify**:

```bash
cd apps/api && python -m pytest plane/tests/unit/gamification/test_gamification_service.py -q
```

Expected: all service tests pass; exit 0.

### Step 3: Wire human task/doc events without risking source writes

Keep the receivers in `apps/api/plane/db/models/gamification.py` so importing
the exported models registers them with Django. Use string senders (`"db.Page"`
and `"db.Issue"`) to avoid circular imports, following `agent.py`.

Add:

- An `Issue` `pre_save` receiver that, only for existing rows whose state may
  have changed, reads and attaches the previous state's group to the in-memory
  instance. Skip the query when `update_fields` excludes `state`/`state_id`.
- An `Issue` `post_save` receiver:
  - On creation, award `task_created` only.
  - On update, award `task_completed` only when the captured previous group was
    not `completed` and the new state group is `completed`.
- A `Page` `post_save` receiver that awards `doc_created` only when `created` is
  true.

Every receiver must:

- Resolve the human actor with `crum.get_current_user()` and exit for anonymous,
  missing, inactive, or bot actors. Require the actor to match the model's
  human creator for creation awards; use the request actor for completion.
- Capture only primitive IDs/timestamps in the callback closure.
- Call the service through `transaction.on_commit(callback, robust=True)`.
- Log failures with event type/source IDs but never re-raise into the source
  write path.
- Rely on the service's unique constraint for retries and duplicate callbacks.

Do not patch every serializer/view, and do not use `IssueActivity.post_save`:
that model is frequently inserted with `bulk_create`, which bypasses signals.

Add signal tests using real model saves with an explicit current user context
matching the production CRUM behavior. Cover:

- Human task creation awards 5 XP exactly once.
- Human transition to completed awards 20 XP exactly once.
- Reopen/recomplete, repeated save, and task created completed do not duplicate.
- Human page creation awards 15 XP; page update does not.
- Bot and no-current-request/background saves award nothing.
- A forced award-service failure does not roll back task/page creation.

**Verify**:

```bash
cd apps/api && python -m pytest plane/tests/unit/gamification/test_gamification_signals.py -q
```

Expected: all signal tests pass; exit 0.

### Step 4: Backfill existing human-created tasks and pages safely

Create `backfill_gamification` with required operator controls:

- `--workspace-slug <slug>` (optional; all active workspaces when omitted)
- `--user-id <uuid>` (optional, combinable with workspace)
- `--since YYYY-MM-DD` (default: 365 days ago)
- `--dry-run` (no writes; prints candidates grouped by event type)
- `--batch-size` (default 500)

Backfill only reconstructable events:

- `task_created` from `Issue.created_by` / `Issue.created_at`.
- `doc_created` from `Page.created_by` / `Page.created_at`.
- Do **not** infer `task_completed` from today's state or `completed_at`: the
  historical actor cannot be reconstructed reliably.

Skip bot creators and users who are no longer active workspace members. Insert
through the same award service (or a documented bulk helper that enforces the
same unique constraint), then call `rebuild_gamification_profile` per affected
user so historical dates produce correct streaks. Re-running the command must
write zero new events.

Test dry-run, filters, bot exclusion, inactive membership exclusion,
idempotency, 365-day default, and the explicit absence of completion backfill.

**Verify**:

```bash
cd apps/api && python -m pytest plane/tests/unit/gamification/test_backfill_gamification.py -q
```

Expected: all command tests pass; exit 0.

### Step 5: Expose an authenticated, current-user-only summary API

Create `WorkspaceGamificationSummaryEndpoint` in
`apps/api/plane/app/views/workspace/gamification.py` and export/register it at:

```text
GET /api/workspaces/{slug}/gamification/me/?range=all|30d|7d
```

Requirements:

- Use the same workspace permission decorator as the current activity endpoint:
  `ADMIN`, `MEMBER`, and `GUEST` at workspace level.
- Fetch the workspace by slug and always call the summary builder with
  `request.user`; never read a user ID from query/body/path.
- Invalid range falls back to `all`, matching the existing endpoint.
- `all` means 365 days. Range affects daily buckets only; lifetime points,
  level, counts, streak, achievements, and recent events stay lifetime values.
- Use bounded indexed queries. The endpoint must not scan all workspace users
  or all workspace pages/issues.
- Leave `/activity-summary/` unchanged for compatibility.

Contract tests must cover 200 response shape, empty user, range lengths,
invalid-range fallback, current-user isolation with two members, cross-workspace
isolation, unauthenticated denial, and non-member denial.

**Verify**:

```bash
cd apps/api && python -m pytest plane/tests/contract/app/test_gamification_app.py -q
```

Expected: all endpoint tests pass; exit 0.

### Step 6: Replace the abandoned activity card with the Momentum Home section

Create `apps/web/core/services/gamification.service.ts` with an exact TypeScript
representation of the API contract and a `summary(workspaceSlug, range)` method.
Do not duplicate point values, levels, achievement titles, or targets locally;
render the server response. In `home-preferences.service.ts`, replace `activity`
with `momentum` in `THomeSectionKey` while retaining the legacy activity summary
types and method for compatibility.

Rename `activity-heatmap-section.tsx` to `momentum-section.tsx` and refactor it
into `MomentumSection`:

- Keep the tested-in-production 20-week grid packing, square cells, range pills,
  loading state, SWR polling (60 seconds), focus revalidation, and preview
  injection pattern.
- Fetch `gamification/me/?range=all` once. Derive the 7d/30d daily heatmap slice
  client-side so changing pills is instant; do not alter lifetime level or
  achievement values when the range changes.
- Header: Solar trophy/spark icon, `Momentum`, `Level N · Name`, and total XP.
- First row: level progress bar with current floor and next threshold. At
  Harvest render `Max level` and a full bar.
- Stats: Current streak, Longest streak, Tasks completed, Docs created. Do not
  render the old workspace-wide peak hour/top type stats.
- Achievements: compact horizontal/wrapping list of all ten achievements.
  Unlocked items get the brand treatment and unlock date; locked items show
  progress (`7 / 10`) with subdued styling. Use Solar icons through existing
  conventions; a single shared icon is acceptable in V1.
- Heatmap: color by `points`, tooltip as
  `YYYY-MM-DD — N XP across M actions`; keep the 20-week label.
- Recent XP: show the five newest events with server-returned point value and
  human label (`Completed a task`, `Created a doc`, etc.). Link to a task/page
  only if the existing routing helpers can build the URL from the returned
  fields without another API request; otherwise render non-clickable rows.
- Empty state: `Build momentum by creating a doc or finishing a task.` Do not
  show zero-valued achievement clutter above the invitation; place the locked
  achievement row below it.
- Responsive: 320px viewport has no horizontal page scroll; the heatmap may
  clip within its own card exactly as the current component does.
- Motion: no confetti, pulsing, or looping animation. Honor reduced motion and
  use only existing color/opacity transitions.

Export `MomentumSection` from the section barrel, import it in `home/root.tsx`,
and render it immediately after `{header}` and before Recent docs when
`enabledKeys("momentum")` is true.

Convert the existing `/__preview/activity` fixture to a deterministic Momentum
payload demonstrating: level progress, a 7-day streak, mixed locked/unlocked
achievements, variable daily XP, and recent events. Keep the route so reviewers
can inspect it without auth.

**Verify**:

```bash
pnpm --filter=web check:types
pnpm --filter=web build
```

Expected: both commands exit 0 with no TypeScript/build errors.

Then run the web dev server and inspect both widths:

```bash
pnpm --filter=web dev
```

- `http://127.0.0.1:3000/__preview/activity` at 1280px and 320px.
- An authenticated workspace Home to confirm real SWR data and the preference
  migration.

Expected: no horizontal page scroll, no hydration errors, correct empty/max
level behavior, and no non-Solar icons.

### Step 7: Run full verification and perform an idempotent rollout smoke

Run all gates:

```bash
cd apps/api && python manage.py makemigrations --check --dry-run
cd apps/api && python -m pytest plane/tests/unit/gamification plane/tests/contract/app/test_gamification_app.py -q
pnpm test:api
pnpm --filter=web check:types
pnpm --filter=web build
pnpm check
```

Expected: every command exits 0.

On a disposable/local database, verify the command twice:

```bash
cd apps/api
python manage.py backfill_gamification --workspace-slug <local-workspace> --dry-run
python manage.py backfill_gamification --workspace-slug <local-workspace>
python manage.py backfill_gamification --workspace-slug <local-workspace>
```

Expected: dry-run reports candidates without writes; first live run creates the
expected task/doc events; second live run creates zero events and leaves totals
unchanged.

Finally inspect:

```bash
git status --short --branch
git diff --check
git diff --stat
```

Expected: on `main`; no whitespace errors; only the in-scope source files plus
the status row in `plans/README.md` are changed by this implementation. Do not
commit or push without user authorization.

## Test plan

### Backend service tests

- Award happy paths for all three events and exact XP snapshots.
- Duplicate source/event is a no-op and does not mutate counters/unlocks.
- The same task can earn create + complete once each.
- Membership, inactive user, bot, unknown event, and unknown source guards.
- Timezone boundary and invalid-timezone fallback.
- Streak today, yesterday grace, gap reset, longest streak, out-of-order rebuild.
- Level boundaries and max-level null next threshold.
- Every achievement's locked progress and one-time unlock.
- Concurrent duplicate attempts are constrained at the database layer. If a
  reliable threaded DB test is not practical in the suite, assert the named
  unique constraint and cover sequential duplicate calls.

### Signal tests

- Human Page/Issue creation.
- Page update and ordinary Issue update do not award.
- First state transition to completed awards; completed→started→completed does
  not award again.
- Create-in-completed-state earns only create XP.
- Bot/background saves award nothing.
- Award callback failure cannot roll back the Page/Issue.

### API contract tests

- Empty and populated response shapes.
- 7, 30, and 365 contiguous bucket lengths.
- Current-user, workspace, membership, and auth isolation.
- Recent-event cap and metadata non-exposure.

### Backfill tests

- Dry-run, filters, default since date, batch size, bot/inactive-member skips.
- No inferred historical completions.
- Repeat run is idempotent and rebuilds correct historical streaks.

### Web verification

- Typecheck and production build.
- Preview at desktop and 320px.
- Empty profile, partially progressed profile, and max-level payloads.
- Range switching, achievement locked/unlocked state, tooltip copy, and SWR
  loading/error behavior.

## Done criteria

All must hold:

- [ ] Three constrained gamification tables exist and
      `makemigrations --check --dry-run` reports no drift.
- [ ] Only authenticated human actions create events; bots/background writes do
      not.
- [ ] Repeating any source action or the backfill cannot duplicate XP.
- [ ] Task completion is awarded once per task and never inferred historically.
- [ ] Streak calculations use `User.user_timezone` and preserve the empty-today
      grace behavior.
- [ ] The current-user-only API returns bounded, indexed data and leaks no other
      member's progress or event metadata.
- [ ] Existing `/activity-summary/` behavior and mobile contracts are untouched.
- [ ] Home renders Momentum before Recent docs and respects the migrated
      `momentum` preference.
- [ ] The web UI has level progress, streaks, achievements, XP heatmap, recent
      events, loading, empty, and max-level states.
- [ ] `python -m pytest plane/tests/unit/gamification
plane/tests/contract/app/test_gamification_app.py -q` passes.
- [ ] `pnpm test:api`, `pnpm --filter=web check:types`,
      `pnpm --filter=web build`, and `pnpm check` all exit 0.
- [ ] Second backfill run reports zero new events and unchanged totals.
- [ ] No file outside the in-scope list was changed by the executor.
- [ ] `plans/README.md` marks plan 027 DONE (or BLOCKED with a concrete reason).

## STOP conditions

Stop and report; do not improvise if:

- Migration `0163` is already occupied or the migration graph no longer ends at
  `0162_page_folder_type` and the correct merge/next migration is ambiguous.
- In-scope files contain user changes not represented by commit `c05b67c942`
  that overlap this plan.
- Product wants team leaderboards, public profiles, redeemable rewards, custom
  rules, or mobile/Copilot in the same release. Those materially change privacy,
  abuse, schema, and scope and need a revised plan.
- Folder/PDF/sheet/whiteboard pages should not count as docs; resolve the exact
  artifact rule before persisting events.
- CRUM does not expose the authenticated actor reliably in contract tests. Do
  not fall back to `created_by` for background writes; redesign the explicit
  actor handoff and update this plan.
- Completing a task through a supported human UI path bypasses `Issue.save`.
  Identify the exact path and report it rather than patching unrelated activity
  infrastructure ad hoc.
- The unique constraint cannot be applied due to duplicate pre-existing data.
  A brand-new table should be empty; this indicates drift or a partial deploy.
- A step's verification fails twice after a reasonable scoped correction.
- The implementation appears to require an out-of-scope file or a new runtime
  dependency.

## Maintenance notes

- Point values are snapshots on ledger rows. Changing rules affects future
  events only; a retroactive rescore needs a separately reviewed migration or
  management command.
- Keep award idempotency keyed to semantic source action, not request IDs or
  timestamps. Network retries and Celery retries must never change XP.
- If mobile adopts Momentum later, share the API response type in
  `packages/types` only when both clients need it; V1 should not move web-only
  types preemptively.
- If leaderboards are ever proposed, require explicit workspace opt-in, privacy
  review, role-based visibility, anti-abuse rules, and an explanation of why
  ranking improves the product. Do not simply expose `GamificationProfile`.
- Reviewers should scrutinize signal actor resolution, transaction boundaries,
  unique constraints, timezone tests, query counts, and backfill idempotency
  more than cosmetic XP copy.
- A later notification/toast plan can consume `AwardResult.new_unlocks`; do not
  add acknowledgement state until a surface actually needs it.
