# Plan 043: Finish and verify custom-field dropdown layering above modals

> **Executor instructions**: A fix is already dirty in the working tree:
> `CustomSelect` and `CustomSearchSelect` were raised from `z-30` to `z-[120]`.
> Preserve and validate that work before changing it.
>
> **Dirty-state check (run first)**:
> `git diff -- packages/ui/src/dropdowns/custom-select.tsx packages/ui/src/dropdowns/custom-search-select.tsx packages/ui/src/modals/modal-core.tsx apps/web/core/components/custom-fields/create-update-custom-field-modal.tsx`

## Status

- **Priority**: P1
- **Effort**: S remaining
- **Risk**: MED — shared dropdown primitives affect many surfaces
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d2ca9cd196`, 2026-07-30; fix already IN PROGRESS in the working tree

## Why this matters

The create-field modal's type dropdown is portaled to `document.body`, but its
old `z-30` layer sat below the modal backdrop at `z-[100]`. Raising the shared
portal fixes the immediate bug, but because both selects are shared components,
the change needs representative regression coverage for normal pages, modals,
and nested overlays.

## Current state

- `ModalCore` uses backdrop `z-[100]` and panel `z-[110]`.
- Dirty changes set both shared select option surfaces to `z-[120]`.
- `CreateUpdateCustomFieldModal` uses `CustomSelect` for field type.
- The select is portaled to `document.body`, so a child z-index inside the modal
  stacking context cannot solve this bug.
- Other shared menus remain around `z-30`/`z-50`; this plan must not globally
  raise unrelated overlays.

## Scope

**In scope**:

- `packages/ui/src/dropdowns/custom-select.tsx`
- `packages/ui/src/dropdowns/custom-search-select.tsx`
- `packages/ui/src/dropdowns/*.stories.tsx` or the existing story location
- `apps/web/core/components/custom-fields/create-update-custom-field-modal.tsx`
- A focused Web/UI regression story or browser test

**Out of scope**:

- Reassigning all application z-index values.
- Raising `CustomMenu`, context menus, tooltips, or popovers without a
  reproduced collision.
- Changing modal animation or layout.

## Steps

### Step 1: Confirm the stacking-root diagnosis

Inspect the option element in the browser and prove it is a body portal with
computed z-index below the backdrop before the dirty change and above the panel
after it.

**Verify**: the options receive pointer events and the backdrop does not.

### Step 2: Keep the narrow shared fix

Retain a documented select-portal layer above `ModalCore` content. If the repo
already has a modal portal constant that can be imported without coupling UI
packages, use it; otherwise keep the explicit value with a comment explaining
the `100/110/120` contract.

**Verify**: `pnpm --filter=@plane/ui check:types` exits 0.

### Step 3: Add a representative modal story/test

Render both `CustomSelect` and `CustomSearchSelect` inside `ModalCore`. Assert or
visually verify open options are visible/clickable, keyboard navigation works,
outside click closes the select without incorrectly closing the modal, and
Escape behavior is deterministic.

**Verify**: UI Storybook builds or the focused browser test passes.

### Step 4: Smoke shared consumers

Test one normal-page select, the create-field modal, a scrollable modal, and a
select near the viewport edge. Confirm placement/collision handling and no
options leaking over a later-opened modal.

## Execution evidence — 2026-07-30

- Both shared select variants now consume one documented
  `SELECT_PORTAL_LAYER_CLASS`, preserving the narrow 100/110/120 modal contract.
- Added a ModalCore Storybook regression surface containing both
  `CustomSelect` and `CustomSearchSelect`.
- `@plane/ui` typecheck and the production Storybook build pass.
- No unrelated menu, popover, tooltip, or overlay primitive was raised.
- Interactive smoke of normal pages, viewport collision, and stacked modals
  remains open.

## Done criteria

- [ ] Create-field options render and receive input above the backdrop.
- [x] Both shared select variants have modal coverage.
- [ ] Normal-page placement and dismissal remain correct.
- [x] No unrelated overlay primitive was raised.
- [x] UI/Web typechecks and the regression story/test pass.

## STOP conditions

- The dirty change belongs to another unfinished overlay redesign.
- A numeric z-index increase causes options from a background modal to appear
  over a newer modal.
- Correct behavior requires a general overlay manager; file that as a separate
  architectural plan instead of expanding this bug fix.
