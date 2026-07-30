# Plan 039: Replace routine empty-state illustrations with Solar icons

> **Executor instructions**: Migrate routine product empty states in measured
> batches. Preserve illustrations that explain onboarding, errors, permissions,
> or analytics concepts; this plan is not a blanket asset deletion.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- apps/web/core/components/empty-state apps/web/public/empty-state packages/ui`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED — broad visual reach, little product logic
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Implementation result

- **Status**: Implemented and release-checked on 2026-07-30.
- Routine Docs, tasks, bookmarks, stickies, workflows, activity, search, and
  dashboard empty states use the shared Solar icon primitive.
- Explanatory, onboarding, destructive-confirmation, and analytics artwork is
  intentionally preserved.
- Shared rendering tests cover both semantic icons and retained illustrations;
  Web types and the production build pass.

## Why this matters

Routine “no items yet” screens currently mix large illustrations with a newer
Solar-icon language. Icons reduce visual noise, load less artwork, and make
blank states feel like part of the same product. Illustrations still earn their
place where they teach a concept rather than merely signal absence.

## Current state

- `apps/web/core/components/empty-state/empty-state-icon.tsx` already maps Docs,
  Tasks, Bookmarks, Whiteboards, Stickies, and Workflows to Solar BoldDuotone
  icons.
- `simple-empty-state-root.tsx` and `detailed-empty-state-root.tsx` are still
  asset-path-first primitives used throughout the app.
- Some issue layouts already use `EmptyStateIcon`, but many feature empty states
  still pass an illustration path directly.

## Classification rule

Use an icon for:

- empty collection, empty filter/search, no recent items, or no activity;
- a state whose title/body already explains the next action.

Keep an illustration for:

- onboarding/education, permission or fatal error, import/export explanation;
- analytics diagrams or a visual that communicates information absent from text;
- marketing/public surfaces.

## Scope

**In scope**:

- `apps/web/core/components/empty-state/empty-state-icon.tsx`
- `apps/web/core/components/empty-state/simple-empty-state-root.tsx`
- `apps/web/core/components/empty-state/detailed-empty-state-root.tsx`
- Routine empty-state call sites under `apps/web/core/components/**`
- Storybook stories for the shared primitives if an existing story location is
  available
- Removing only assets proven unreferenced after migration

**Out of scope**:

- `apps/landing/**`, mobile, admin, and public Space.
- Onboarding, permission, fatal-error, and explanatory illustrations.
- Rewriting empty-state copy or CTA behavior.

## Steps

### Step 1: Produce a deterministic inventory

Use:

```bash
rg -l "SimpleEmptyState|DetailedEmptyState|EmptyStateIcon" apps/web/core/components | sort
```

Classify each result with the rule above in the implementation PR description
before editing. Every migrated file must be in the “routine” list.

**Verify**: every call site is classified and no ambiguous state is silently
migrated.

### Step 2: Make the shared primitive visual-type-safe

Add an explicit visual union such as:

```ts
type EmptyStateVisual = { type: "icon"; name: TEmptyStateIconName } | { type: "asset"; path: string; alt?: string };
```

Keep the existing asset prop temporarily for compatibility, but warn through
types/deprecation comments so new routine states choose an icon. Decorative
icons must be `aria-hidden`; informative assets need alt text.

**Verify**: `pnpm --filter=web check:types` exits 0.

### Step 3: Expand the Solar map only for classified states

Add semantic names needed by the routine inventory, reusing the same Solar icon
as the corresponding navigation/action when possible. Do not import another
icon family.

**Verify**: Web typecheck exits 0 and no HugeIcons/Phosphor import is introduced.

### Step 4: Migrate in feature batches

Suggested order: Docs/Pages, Issues/My Tasks, Calendar/Activity, Settings. After
each batch, run the Web typecheck and smoke both the unfiltered and filtered
empty variants. Preserve titles, descriptions, CTAs, and analytics events.

**Verify**: each batch typechecks before the next begins.

### Step 5: Remove dead assets

For each candidate asset, prove no references remain with `rg`. Delete only
unreferenced assets owned by migrated routine states.

**Verify**: Web build succeeds and a repository search finds no broken path.

## Test plan

- Add component tests or stories for icon, asset, CTA, and no-CTA variants.
- Visual smoke at desktop/mobile widths, light/dark themes, and 200% zoom.
- Confirm icon color/size remains legible but subordinate to the title.

## Done criteria

- [x] Every in-scope call site is explicitly classified.
- [x] Routine states use Solar icons through the shared primitive.
- [x] Explanatory/onboarding/error illustrations remain intact.
- [x] Only proven-dead assets are removed.
- [x] Web typecheck/build and visual matrix pass.

## STOP conditions

- A state is ambiguous between routine absence and onboarding/education.
- Migration would alter copy, CTA, analytics, or feature behavior.
- A candidate asset is referenced outside the Web app.
