# Plan 042: Remove Views and Intake from Project settings navigation

> **Executor instructions**: This is information-architecture cleanup only.
> Keep the actual Views and Intake product routes/data intact.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- packages/constants/src/settings/project.ts apps/web/app/routes/core.ts apps/web/app/\\(all\\)/\\[workspaceSlug\\]/\\(settings\\)/settings/projects`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Implementation result

- **Status**: Implemented and release-checked on 2026-07-30.
- Project settings now lists Pages as its only Features entry.
- The old Views and Intake settings URLs redirect to Project General; their
  primary product routes and stored data remain unchanged.
- Navigation coverage, Web types, and the production build pass.

## Why this matters

Views and Intake configuration entries add noise to Project settings and imply
feature controls the product no longer wants to expose there. Removing them
from settings should not delete saved Views, Intake pages, APIs, or primary
product navigation.

## Current state

- `packages/constants/src/settings/project.ts:61-80` defines
  `features_views` and `features_intake`.
- `GROUPED_PROJECT_SETTINGS` includes both under Features at lines 114-120.
- `apps/web/app/routes/core.ts:416-425` still exposes their settings URLs.
- The sidebar is driven from the grouped settings constants.

## Scope

**In scope**:

- `packages/constants/src/settings/project.ts`
- The two legacy settings route modules under
  `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/features/`
- `apps/web/app/routes/core.ts` only if a redirect/removal is required
- Focused constants/router tests

**Out of scope**:

- Project `/views` and `/intake` product pages.
- API models, saved filters, intake submissions, or feature flags.
- Removing Pages from settings.

## Steps

### Step 1: Remove the two sidebar entries

Remove `features_views` and `features_intake` from
`GROUPED_PROJECT_SETTINGS`. Remove their definitions only if no non-sidebar
consumer uses them.

**Verify**:
`rg -n "features_(views|intake)" packages/constants apps/web/core/components/settings`
returns only intentionally retained references.

### Step 2: Make legacy settings URLs safe

Choose one consistent behavior: redirect both old settings URLs to Project
General, or retain hidden pages if bookmarked configuration must remain
reachable. The product request says “remove from settings,” so prefer redirect
unless current product ownership explicitly requires hidden access.

**Verify**: both legacy URLs resolve without a 404 or redirect loop.

### Step 3: Add regression coverage

Assert the Features settings group contains Pages but not Views or Intake.
Assert primary Views and Intake product routes still exist.

**Verify**: focused tests and `pnpm --filter=web check:types` pass.

### Step 4: Runtime smoke

As a Project admin and member, inspect settings navigation, visit both legacy
URLs, then open the actual Views and Intake product surfaces.

## Done criteria

- [x] Views and Intake are absent from Project settings for every role.
- [x] Legacy settings URLs fail safely via the agreed behavior.
- [x] Product Views and Intake remain functional.
- [x] Pages remains in the Features settings group.
- [x] Tests and Web typecheck pass.

## STOP conditions

- A settings entry is reused as primary product navigation.
- Removing a route would delete or mutate configuration/data.
- Product ownership wants the pages hidden from navigation but still directly
  reachable; record that decision and retain the route.
