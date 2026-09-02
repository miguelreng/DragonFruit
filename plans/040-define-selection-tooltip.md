# Plan 040: Define the “Tooltip when selected” interaction before implementation

> **Executor instructions**: This is a discovery gate. Do not change source
> code until the target surface, trigger, content, placement, and dismissal
> behavior are recorded and approved.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- packages/editor/src/core/components/menus/bubble-menu apps/web/core/components`

## Status

- **Priority**: P1 after definition
- **Effort**: XS discovery, then likely S implementation
- **Risk**: LOW technically; HIGH requirement ambiguity
- **Depends on**: reporter acceptance criteria
- **Category**: direction
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Why this matters

“Tooltip when selected” does not identify what is selected or what the tooltip
should say. The editor already shows a selection bubble menu with Reply with
Atlas, Explain, Comment, and formatting actions, while many non-editor controls
also have selected states. A precise five-line interaction contract prevents a
small UI request from being implemented on the wrong surface.

## Current state

- `packages/editor/src/core/components/menus/bubble-menu/root.tsx:233-329`
  renders actions when text is selected.
- Those actions already have `title`/`aria-label` text, but no separate
  explanatory tooltip contract is evident.
- No screenshot annotation or issue description identifies the intended
  selected object.

## Required interaction contract

Add the answers to `plans/040-selection-tooltip-findings.md`:

1. **Surface/object** — text, Doc card, task row, table cell, or another object.
2. **Trigger** — selection, hover while selected, focus, or delayed hover.
3. **Content** — exact copy or data to display.
4. **Placement/dismissal** — anchor, collision behavior, Escape/outside click.
5. **Input/accessibility** — pointer, keyboard, touch, and screen-reader result.

Attach or link one annotated screenshot.

## Scope after approval

**Likely in scope**:

- One target component named by the findings.
- Existing `@plane/ui` or `@plane/propel` Tooltip/Popover primitive.
- One focused test or Storybook story.

**Out of scope**:

- Building a new tooltip system.
- Changing the editor bubble-menu actions unless the contract names that
  surface.
- Shipping a pointer-only interaction with no keyboard equivalent.

## Steps

### Step 1: Reproduce the current selection state

Record the current UI before changes and complete the five-part contract.

**Verify**: a reviewer can identify the exact DOM anchor and expected copy from
the findings alone.

### Step 2: Choose Tooltip vs Popover

Use Tooltip only for short, non-interactive explanatory text. Use Popover when
the content is interactive, persistent, or contains more than a short label.
Reuse the existing shared primitive.

**Verify**: the choice matches the approved trigger and dismissal contract.

### Step 3: Implement narrowly

Modify only the named target and add its focused test/story. Preserve selection
state, focus, and touch behavior.

**Verify**: the owning package typecheck/tests pass.

### Step 4: Accessibility smoke

Test mouse, keyboard, Escape, focus return, touch (if in scope), reduced motion,
and 200% zoom.

## Done criteria

- [ ] Findings contain all five contract fields and an annotated screenshot.
- [ ] The shared Tooltip or Popover primitive is reused.
- [ ] The interaction works with pointer and keyboard.
- [ ] Focus/selection is not lost when the overlay opens or closes.
- [ ] Focused tests/typecheck pass.

## STOP conditions

- Any contract field remains unknown.
- The request refers to a surface not present in the repository.
- Interactive content is requested inside a Tooltip.
- Opening the overlay necessarily destroys the selection it explains.

