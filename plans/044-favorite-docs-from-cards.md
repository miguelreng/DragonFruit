# Plan 044: Let users favorite a Doc directly from its card

> **Executor instructions**: Reuse the existing favorite store and page
> favorite semantics. Do not add a second favorite endpoint or local-only state.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- apps/web/core/components/docs/workspace-docs-root.tsx apps/web/core/hooks/store/use-favorite.ts apps/web/core/components/pages/header/favorite-control.tsx`
> `workspace-docs-root.tsx` is currently dirty; reconcile its live diff first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Implementation result

- **Status**: Implemented and release-checked on 2026-07-30.
- Grid, paper, and list Doc cards expose the shared favorite action.
- The button isolates pointer/click events from card navigation, selection, and
  drag while using the existing optimistic favorite store and rollback.
- Favorite metadata coverage, Web types, and the production build pass.

## Why this matters

Docs can already be favorited from the open Page header, and folders can be
favorited from the Docs gallery. Doc cards omit that action, forcing users to
open a Doc before organizing it. A direct, stateful star makes the gallery
consistent and faster.

## Current state

- `workspace-docs-root.tsx:322` already reads `addFavorite`,
  `removeFavoriteEntity`, and `favoriteEntityMap`.
- Folder cards receive `isFavorite` and `onToggleFavorite` at lines 1052-1065.
- `DocCard` receives no favorite props; its actions menu begins around line
  2476 and has Copy, Duplicate, Move, Archive, and Delete.
- `PageFavoriteControl` calls the existing Page operation and exposes correct
  Add/Remove aria labels.

## Target behavior

- A star button is directly available on gallery cards and list rows.
- Unfavorited star appears on hover/focus; favorited star remains visible.
- Clicking never opens or drags the card.
- State updates optimistically, rolls back on failure, and syncs the sidebar,
  gallery, and open Page header.
- Archived and Project Brief behavior follows the existing Page favorite
  permission, not archive/delete permission.

## Scope

**In scope**:

- `apps/web/core/components/docs/workspace-docs-root.tsx`
- A focused helper/component test beside the Docs surface
- Existing favorite store methods as read-only dependencies

**Out of scope**:

- New favorite APIs or database changes.
- Reordering favorites.
- Favoriting public/signed-out Docs.
- Redesigning the card action menu.

## Steps

### Step 1: Share one Page toggle handler

Generalize the folder-only handler so both folders and Docs use the same
`entity_type: "page"` payload, correct project ID, and an `entity_data` snapshot
with name/page type. Keep one optimistic update/rollback path and one error
message strategy.

**Verify**: `pnpm --filter=web check:types` exits 0.

### Step 2: Thread favorite props to Doc cards/rows

Pass `isFavorite` and `onToggleFavorite` from the gallery root. Do not make
`DocCard` call the favorite store directly; keep data flow consistent with
FolderCard.

**Verify**: Web typecheck exits 0.

### Step 3: Add the direct control

Place the Star beside the actions affordance in each card style and list layout.
Prevent default plus pointer/click propagation so it neither navigates nor
starts drag/select. Use a visible selected state and the same aria labels as
`PageFavoriteControl`.

**Verify**: focused component test proves click isolation and label/state
changes.

### Step 4: Synchronization smoke

Favorite/unfavorite from gallery, list, open Page header, and sidebar. Simulate
an API failure and confirm rollback/toast. Test keyboard focus and card drag.

## Done criteria

- [x] Gallery and list Doc surfaces expose a direct accessible star.
- [x] Favorited state remains visible; unfavorited state appears on hover/focus.
- [x] Click does not navigate, select, or drag the card.
- [x] Sidebar/header/gallery state stays synchronized with rollback on error.
- [x] Web typecheck and focused tests pass.

## STOP conditions

- The favorite store cannot optimistically update and roll back safely.
- Page favorite permission differs from folder favorite permission.
- Existing dirty Docs work conflicts with card overlay placement.
