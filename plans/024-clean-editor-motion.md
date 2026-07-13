# 024 — Clean editor motion primitives

- **Status**: DONE
- **Commit**: 841bb4897b
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 3 files, medium

## Problem

The editor surface has several motion issues: task checkmarks scale from `0`, fade-in uses `ease-in`, and editor/table CSS uses `transition: all`, which can animate unintended layout/paint properties.

```css
/* packages/editor/src/styles/editor.css:162 — current */
&::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.5em;
  height: 0.5em;
  transform: scale(0);
  transform-origin: center;
  transition: 120ms transform ease-in-out;
  box-shadow: inset 1em 1em;
  clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
}

&:checked::before {
  transform: scale(1) translate(-50%, -50%);
}
```

```css
/* packages/editor/src/styles/editor.css:211 — current */
.fade-in {
  opacity: 1;
  transition: opacity 0.3s ease-in;
}
```

```css
/* packages/editor/src/styles/table.css:151 — current */
.table-wrapper {
  .table-column-insert-button,
  .table-row-insert-button {
    position: absolute;
    background-color: var(--background-color-layer-1);
    @apply text-tertiary border border-subtle-1;
    border-radius: 4px;
    display: grid;
    place-items: center;
    opacity: 0;
    pointer-events: none;
    outline: none;
    z-index: 9;
    transition: all 0.2s ease;
```

```css
/* packages/editor/src/styles/variables.css:247 — current */
.editor-container.page-title-editor .ProseMirror,
.document-editor-loader {
  max-width: var(--editor-content-width);
  margin: 0 auto;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.editor-container.document-editor .ProseMirror {
  & > *:not(.editor-full-width-block) {
    max-width: var(--editor-content-width);
    margin-left: auto !important;
    margin-right: auto !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
```

## Target

Use nonzero scale + opacity for checkmarks, ease-out for appearances, and explicit transition properties.

```css
/* target task checkmark */
&::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.5em;
  height: 0.5em;
  transform: translate(-50%, -50%) scale(0.9);
  transform-origin: center;
  opacity: 0;
  transition:
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 120ms cubic-bezier(0.23, 1, 0.32, 1);
  box-shadow: inset 1em 1em;
  clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
}

&:checked::before {
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
}
```

```css
/* target fade */
.fade-in {
  opacity: 1;
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
```

```css
/* target table insert buttons */
transition:
  background-color 200ms ease,
  border-color 200ms ease,
  color 200ms ease,
  opacity 200ms ease;
```

```css
/* target editor width transitions */
transition:
  max-width 200ms cubic-bezier(0.23, 1, 0.32, 1),
  padding-inline-start 200ms cubic-bezier(0.23, 1, 0.32, 1),
  padding-inline-end 200ms cubic-bezier(0.23, 1, 0.32, 1);
```

## Repo conventions to follow

- Editor CSS already has a local reduced-motion block for doc-review writing at `packages/editor/src/styles/dragonfruit.css:571`; if adding reduced-motion guards in editor styles, keep them close to the affected selectors.
- Use `cubic-bezier(0.23, 1, 0.32, 1)` for strong UI ease-out from the audit.
- Keep editor task-list markup unchanged; this is CSS-only.

## Steps

1. In `packages/editor/src/styles/editor.css`, replace the task checkbox `::before` transform/transition with the Target task checkmark code.
2. In the same file, change `.fade-in` from `opacity 0.3s ease-in` to `opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)`.
3. In `packages/editor/src/styles/table.css`, replace `transition: all 0.2s ease;` on table insert buttons with the explicit Target transition list.
4. In `packages/editor/src/styles/variables.css`, replace both `transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);` declarations with explicit max-width/padding transitions using `cubic-bezier(0.23, 1, 0.32, 1)`.
5. Add a local reduced-motion override if needed:
   ```css
   @media (prefers-reduced-motion: reduce) {
     .editor-container.page-title-editor .ProseMirror,
     .document-editor-loader,
     .editor-container.document-editor .ProseMirror > *:not(.editor-full-width-block) {
       transition: none;
     }
   }
   ```

## Boundaries

- Do NOT change editor document structure, task-list extension code, or ProseMirror behavior.
- Do NOT remove the task checkmark animation entirely for normal motion users.
- Do NOT introduce `transition: all` elsewhere.
- If `variables.css` has drifted and the wide-layout transition is now documented as deliberate, keep the documented behavior and only remove unintended `all`.

## Verification

- **Mechanical**: run `pnpm check:types --filter=@plane/editor` if available; otherwise run `pnpm check:types`. CSS-only changes should not introduce type errors.
- **Feel check**:
  - create/check/uncheck a task item in the editor and confirm the checkmark fades/scales from 0.9, not from nothing;
  - slow animations to 10% in DevTools and confirm the checkmark stays centered during the transition;
  - hover table insert controls and confirm only color/border/opacity animate;
  - toggle normal/wide editor layout and confirm no unrelated properties animate.
- **Done when**: the editor has no `scale(0)`, no `ease-in` fade-in, and no `transition: all` in the audited editor selectors.
