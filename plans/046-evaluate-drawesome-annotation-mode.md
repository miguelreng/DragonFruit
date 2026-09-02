# Plan 046: Evaluate Drawesome as a focused annotation mode

> **Executor instructions**: This is a gated spike. Do not add the dependency to
> production until the product use case, persistence model, accessibility, and
> collaboration expectations pass the decision gate.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- package.json pnpm-lock.yaml apps/web packages/editor`

## Status

- **Priority**: P3 until a use case is approved
- **Effort**: S spike; implementation unknown
- **Risk**: MED
- **Depends on**: approved product use case
- **Category**: direction
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Why this matters

The backlog contains only a link to Drawesome, not a requested workflow.
Drawesome is a lightweight React drawing surface/tool tray and may fit quick
annotations, but DragonFruit already uses Excalidraw for full whiteboards.
Evaluating it as an annotation layer avoids replacing a mature collaborative
surface with a young, local-first package.

## External and repository facts

- `drawesome@0.1.0` describes itself as a React drawing toolbar with seven pens,
  eraser, SVG/PNG export, no runtime dependencies, React 18+ peer support, and
  an MIT license.
- Its public API exposes stroke get/set plus SVG/PNG export; the product site
  does not present a multiplayer transport or DragonFruit persistence adapter.
- DragonFruit already depends on `@excalidraw/excalidraw` for Whiteboard pages.
- Therefore V1 candidate use is **temporary or saved annotation over a Doc/PDF
  review surface**, not a Whiteboard replacement.

Reference: `https://benji.org/drawesome` and package repository
`https://github.com/benjitaylor/drawesome`.

## Decision questions

Record answers in `plans/046-drawesome-findings.md`:

1. Which surface launches annotation: Doc, PDF, screenshot, task attachment, or
   something else?
2. Are marks ephemeral, private per user, or shared/persisted?
3. Must marks collaborate live?
4. What is the output: saved strokes, embedded SVG, PNG attachment, or export
   only?
5. What is the touch/stylus and keyboard-accessible alternative?

## Scope of spike

**In scope**:

- `plans/046-drawesome-findings.md`
- A disposable isolated prototype under a temporary local directory or
  Storybook-only story after approval
- Bundle, CSP, SSR, pointer/touch, export, and dark-theme evaluation

**Out of scope**:

- Replacing Excalidraw or migrating Whiteboard data.
- Production dependency or persisted schema before the decision gate.
- Building collaboration infrastructure during the spike.
- Shipping an inaccessible drawing-only workflow with no alternative.

## Steps

### Step 1: Approve one use case

Complete the five decision questions. Default recommendation: private,
user-invoked annotations over a PDF/Doc snapshot, exported as PNG or stored as
strokes only after the user chooses Save.

**Verify**: one sentence defines user, surface, trigger, saved output, and who
can see it.

### Step 2: Inspect package health and contract

Pin the exact version in the findings; inspect license, unpacked files, types,
SSR globals, CSS isolation, issue activity, and release cadence. Note that
`0.1.0` requires a conservative adoption posture.

**Verify**: findings include pass/fail for license, types, SSR, CSP, and bundle
impact.

### Step 3: Build an isolated prototype

Use a non-production Storybook/local surface with representative DragonFruit
content underneath. Test enable/disable, drawing vs scrolling/selecting, undo,
erase, clear confirmation, export, touch/stylus, resize, dark mode, and reduced
motion.

**Verify**: no pointer events leak when annotation mode is off, and export
matches the visible surface.

### Step 4: Evaluate persistence and collaboration gap

Measure serialized stroke size for small/medium/heavy examples. If shared marks
are required, estimate a separate Yjs/REST design; do not imply Drawesome
provides it. Compare the result with extending the existing Excalidraw surface
or using a simpler SVG overlay.

### Step 5: Make a decision

Choose one:

- **Adopt** for the approved narrow use case and write a new implementation
  plan with exact schema/paths/tests.
- **Prototype longer** with named unknowns and a time box.
- **Reject** because Excalidraw/simple SVG is safer or requirements need live
  collaboration.

## Done criteria

- [ ] The product use case and visibility/persistence contract are explicit.
- [ ] Package health and technical compatibility are measured.
- [ ] An isolated prototype covers pointer, touch, export, themes, and resize.
- [ ] Drawesome is compared with existing Excalidraw and a simple SVG overlay.
- [ ] Findings end in Adopt, Prototype longer, or Reject with evidence.

## STOP conditions

- No single product use case is approved.
- Live collaboration is mandatory for V1.
- SSR/CSP or accessibility cannot be made safe without forking the package.
- Adoption would duplicate or replace Whiteboards without migration rationale.

