# 023 — Preserve feedback in reduced motion

- **Status**: DONE
- **Commit**: 841bb4897b
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, medium

## Problem

The shared motion stylesheet disables all transitions for reduced-motion users, including color and opacity feedback that should remain. It also defines scale-from-nothing primitives (`scale(0)` and near-zero icon scale) that should be softened.

```css
/* packages/tailwind-config/index.css:83 — current */
--text-swap-dur: 150ms;
--text-swap-translate-y: 4px;
--text-swap-blur: 2px;
--text-swap-ease: ease-in-out;
```

```css
/* packages/tailwind-config/index.css:110 — current */
--icon-swap-dur: 200ms;
--icon-swap-blur: 2px;
--icon-swap-start-scale: 0.25;
--icon-swap-ease: ease-in-out;
```

```css
/* packages/tailwind-config/index.css:292 — current */
.t-badge[data-open="false"] .t-badge-dot {
  transform: scale(0);
  opacity: 0;
  filter: blur(var(--badge-blur));
  transition:
    transform var(--badge-pop-close-dur) var(--badge-close-ease),
    opacity var(--badge-fade-close-dur) var(--badge-close-ease),
    filter var(--badge-pop-close-dur) var(--badge-close-ease);
}
```

```css
/* packages/tailwind-config/index.css:594 — current */
@media (prefers-reduced-motion: reduce) {
  .t-resize,
  .t-dropdown,
  .t-modal,
  .t-panel-slide,
  .t-text-swap,
  .t-icon-swap .t-icon,
  .t-page-slide .t-page,
  .t-avatar,
  .t-colors,
  .t-field,
  .t-press,
  .t-toast {
    transition: none !important;
  }
```

Reduced motion should remove movement, not remove all UI feedback.

## Target

Use the audit values exactly:

```css
/* target tokens */
--text-swap-ease: cubic-bezier(0.23, 1, 0.32, 1);
--icon-swap-start-scale: 0.9;
--icon-swap-ease: cubic-bezier(0.23, 1, 0.32, 1);
```

```css
/* target badge closed state */
.t-badge[data-open="false"] .t-badge-dot {
  transform: scale(0.9);
  opacity: 0;
  filter: blur(var(--badge-blur));
  transition:
    transform var(--badge-pop-close-dur) var(--badge-close-ease),
    opacity var(--badge-fade-close-dur) var(--badge-close-ease),
    filter var(--badge-pop-close-dur) var(--badge-close-ease);
}
```

```css
/* target reduced-motion shape */
@media (prefers-reduced-motion: reduce) {
  .t-resize,
  .t-dropdown,
  .t-modal,
  .t-panel-slide,
  .t-text-swap,
  .t-icon-swap .t-icon,
  .t-page-slide .t-page,
  .t-avatar {
    transition: opacity 150ms ease !important;
    transform: none !important;
    filter: none !important;
  }

  .t-colors,
  .t-field,
  .t-press {
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease,
      box-shadow 150ms ease,
      opacity 150ms ease !important;
  }

  .t-toast {
    transition: opacity 200ms ease !important;
    transform: none !important;
  }

  .t-press:active {
    transform: none !important;
  }

  .t-badge-dot,
  .t-digit-group .t-digit,
  .t-success-check {
    animation: none !important;
    transition: opacity 150ms ease !important;
    transform: none !important;
    filter: none !important;
  }
}
```

## Repo conventions to follow

- Shared motion primitives live in `packages/tailwind-config/index.css`; keep this centralized.
- Existing reduced-motion handling for `t-press` already notes the intended behavior at `packages/tailwind-config/index.css:610`: "keep the colour change, drop the scale." The implementation should match that comment.
- Use `cubic-bezier(0.23, 1, 0.32, 1)` for strong UI ease-out from the audit.

## Steps

1. In `packages/tailwind-config/index.css`, change `--text-swap-ease` and `--icon-swap-ease` to `cubic-bezier(0.23, 1, 0.32, 1)`.
2. Change `--icon-swap-start-scale` from `0.25` to `0.9`.
3. Change `.t-badge[data-open="false"] .t-badge-dot` from `scale(0)` to `scale(0.9)`.
4. Replace the reduced-motion block with the Target shape, preserving the existing `.t-success-check` opacity/path completion rules after it.
5. Keep `animation: none !important` for decorative keyframe-only primitives, but preserve opacity/color transitions where they communicate state.

## Boundaries

- Do NOT remove reduced-motion support.
- Do NOT set all animation durations to `0ms`; keep gentle opacity/color feedback.
- Do NOT change product-specific CSS outside `packages/tailwind-config/index.css`.
- If a selector in the current block has been renamed, update only the matching current selectors and STOP for unknown new primitives.

## Verification

- **Mechanical**: run `pnpm check:format --filter=@plane/tailwind-config` if available; otherwise run `pnpm check:format`.
- **Feel check**:
  - enable `prefers-reduced-motion: reduce` in DevTools Rendering;
  - press a `t-press` button and confirm there is no scale movement but color/opacity feedback remains;
  - open a `t-dropdown` and confirm movement is removed while opacity can still communicate state;
  - toggle a password visibility icon and confirm it no longer shrinks from a tiny 0.25 scale.
- **Done when**: reduced-motion users still get useful non-spatial feedback, and no shared primitive scales from zero or near-zero.
