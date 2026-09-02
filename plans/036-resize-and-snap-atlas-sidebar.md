# Plan 036: Make the Atlas sidebar resizable and snap predictably

> **Executor instructions**: Implement desktop resizing without changing the
> existing mobile overlay or the collapsed/full-width controls. Run every gate
> before marking the plan done.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- apps/web/ce/components/workspace/content-wrapper.tsx apps/web/core/store/theme.store.ts`
> Stop on a material mismatch with the current-state description.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Why this matters

Atlas currently has only three hard-coded tiers: a 52 px rail, a 350 px panel,
and full width. A resizable dock lets users balance chat and work content while
snap points keep the interaction fast and prevent unusable intermediate sizes.

## Current state

- `apps/web/ce/components/workspace/content-wrapper.tsx:198-246` renders the
  desktop panel with `md:w-[3.25rem]`, `md:w-[350px]`, or `md:flex-1`.
- `apps/web/core/store/theme.store.ts:9-43,219-259` persists only open,
  collapsed, and expanded booleans.
- The drawer stays mounted while collapsed, which must remain true so chat state
  and focus are preserved.

## Target behavior

- Desktop drag handle on the panel's left edge.
- Width range: 320 px minimum and
  `min(720px, viewport width - 420px)` maximum, recomputed on resize.
- Persist the last non-collapsed, non-full width per browser.
- Snap within 24 px of the 350 px default; double-click resets to 350 px.
- Existing rail and full-width buttons remain authoritative. Dragging from full
  returns to the last regular width; dragging never collapses to the rail.
- Keyboard separator: Left/Right adjusts 16 px, Shift+Left/Right adjusts 64 px,
  Home resets to 350 px.

## Scope

**In scope**:

- `apps/web/ce/components/workspace/content-wrapper.tsx`
- `apps/web/core/store/theme.store.ts`
- `apps/web/helpers/atlas-sidebar-layout.ts` (create)
- `apps/web/helpers/atlas-sidebar-layout.test.ts` (create)

**Out of scope**:

- Mobile drawer resizing.
- Changing the collapsed rail width or full-width content-preview behavior.
- Server-side or cross-device preference sync.
- Reworking Atlas chat content.

## Steps

### Step 1: Add pure width helpers and tests

Create helpers for min/max calculation, clamping, snapping, and safe persisted
width parsing. Test below-min, above-max, narrow viewport, snap threshold edges,
invalid storage, and the 350 px default.

**Verify**:
`pnpm --filter=web test:unit -- --run apps/web/helpers/atlas-sidebar-layout.test.ts`
→ all tests pass.

### Step 2: Persist a regular width in the theme store

Add `ATLAS_SIDEBAR_WIDTH_KEY`, `atlasSidebarWidth`, and
`setAtlasSidebarWidth(width)`. Parse defensively and clamp again at render time
because a stored value may have been written on a larger monitor.

**Verify**: `pnpm --filter=web check:types` exits 0.

### Step 3: Add the accessible resize separator

Render a 6–8 px hit target on the drawer's left edge with
`role="separator"`, `aria-orientation="vertical"`, `aria-valuemin/max/now`,
and the keyboard behavior above. Use Pointer Events and pointer capture; during
drag, set the resize cursor and suppress text selection, restoring both on
pointer up/cancel/unmount.

Update width through `requestAnimationFrame` or an equivalent single-frame
coalescing path. Persist only the settled width on pointer up, not every move.

**Verify**: Web typecheck exits 0.

### Step 4: Reconcile tier transitions

Regular mode uses the numeric width. Collapse and full width retain existing
animations and state. Expanding the rail returns to the saved regular width;
leaving full mode does the same. Clamp on viewport resize without overwriting the
preferred stored width unless the user completes a new drag.

**Verify**: Web typecheck and focused helper tests pass.

### Step 5: Runtime accessibility and interaction smoke

Test at 768, 1024, 1440, and 1920 px widths. Confirm pointer drag, snap,
double-click reset, keyboard resize, reload persistence, collapse/reopen,
full/reopen, no text selection during drag, and no horizontal page overflow.

## Execution evidence — 2026-07-30

- Added pure width bounds, clamping, persistence parsing, snap, reset, and
  keyboard helpers with 24 passing tests.
- Added a persisted regular width to the theme store without overwriting a
  wider preferred value merely because the viewport became narrower.
- Added a full-height 8 px pointer target with pointer capture, frame-coalesced
  live updates, settled-width persistence, cleanup on cancel/unmount,
  double-click reset, and the documented keyboard controls.
- Rail and full modes remain authoritative; beginning a drag in full mode
  returns to the saved regular tier, and the chat drawer stays mounted.
- Formatting and the global Web typecheck pass.
- Responsive signed-in smoke remains open because the local app cannot leave
  its loading screen without the local API/auth stack.
- A later authenticated production smoke covered 768, 1024, 1280, and 1470 px.
  It triggered this plan's content-width STOP condition: the docked panel leaves
  the body editor at approximately 440 px on 1024 and only 134 px at 768 exact.
  The resize mechanics remain valid; Plan 052 corrects the budget by switching
  to overlay when the remaining editor width is below 600 px.

## Done criteria

- [x] Pure width logic has boundary tests.
- [ ] The panel resizes smoothly between the documented bounds.
- [ ] Snap/reset and keyboard behavior work.
- [ ] Regular width persists and survives rail/full transitions.
- [ ] Mobile behavior is unchanged.
- [x] Web typecheck and tests pass.

## STOP conditions

- Resizing requires unmounting `AgentChatDrawer`.
- The content pane cannot retain at least 420 px at a supported desktop width.
- Pointer cleanup leaves the document cursor or text-selection state stuck.
- Existing dirty work overlaps either source file and its intent is unclear.
