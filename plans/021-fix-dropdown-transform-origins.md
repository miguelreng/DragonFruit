# 021 — Make popovers scale from their trigger

- **Status**: DONE
- **Commit**: 841bb4897b
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 5 files, medium

## Problem

Trigger-anchored menus and popovers scale from hard-coded corners instead of the trigger-side origin. The shared dropdown primitive defaults to `top left`, and Base UI components explicitly force that origin even though Base UI exposes the correct `--transform-origin` variable.

```css
/* packages/tailwind-config/index.css:302 — current */
.t-dropdown {
  transform-origin: top left;
  transform: scale(var(--dropdown-pre-scale));
  opacity: 0;
  pointer-events: none;
  transition:
    transform var(--dropdown-open-dur) var(--dropdown-ease),
    opacity var(--dropdown-open-dur) var(--dropdown-ease);
  will-change: transform, opacity;
}
```

```tsx
// packages/propel/src/popover/root.tsx:46 — current
<BasePopover.Popup
  data-slot="popover-content"
  className={cn("t-dropdown is-open", className)}
  data-origin="top-left"
  {...props}
>
```

```tsx
// packages/propel/src/menu/menu.tsx:37 — current
<BaseMenu.Positioner className={""} alignOffset={-4} sideOffset={-4}>
  <BaseMenu.Popup className={cn("t-dropdown is-open", className)} data-origin="top-left">
    {children}{" "}
  </BaseMenu.Popup>
</BaseMenu.Positioner>
```

```tsx
// packages/ui/src/dropdowns/custom-menu.tsx:211 — current
<div
  data-theme={panelDataTheme}
  className={cn(
    "t-dropdown my-1 min-w-[12rem] overflow-y-scroll rounded-lg border border-subtle bg-surface-1 p-1 text-13 whitespace-nowrap shadow-raised-200 focus:outline-none",
    isOpen && "is-open",
    isClosing && "is-closing",
```

```tsx
// packages/ui/src/dropdowns/context-menu/item.tsx:211 — current
<div
  className="t-dropdown is-open min-w-[12rem] overflow-hidden rounded-[18px] border-[0.5px] border-subtle-1 bg-surface-1 px-2 py-2.5 text-13 shadow-raised-200"
  data-context-submenu="true"
  data-origin="top-left"
>
```

## Target

Use real positioning metadata for transform origins:

```css
/* target */
.t-dropdown {
  transform-origin: var(--transform-origin, top left);
  transform: scale(var(--dropdown-pre-scale));
  opacity: 0;
  pointer-events: none;
  transition:
    transform var(--dropdown-open-dur) var(--dropdown-ease),
    opacity var(--dropdown-open-dur) var(--dropdown-ease);
  will-change: transform, opacity;
}

.t-dropdown[data-origin="top-left"] {
  transform-origin: top left;
}

.t-dropdown[data-origin="top-right"] {
  transform-origin: top right;
}

.t-dropdown[data-origin="bottom-left"] {
  transform-origin: bottom left;
}

.t-dropdown[data-origin="bottom-right"] {
  transform-origin: bottom right;
}

.t-dropdown[data-popper-placement^="bottom"] {
  transform-origin: top center;
}

.t-dropdown[data-popper-placement="bottom-start"] {
  transform-origin: top left;
}

.t-dropdown[data-popper-placement="bottom-end"] {
  transform-origin: top right;
}

.t-dropdown[data-popper-placement^="top"] {
  transform-origin: bottom center;
}

.t-dropdown[data-popper-placement="top-start"] {
  transform-origin: bottom left;
}

.t-dropdown[data-popper-placement="top-end"] {
  transform-origin: bottom right;
}

.t-dropdown[data-popper-placement^="right"] {
  transform-origin: left center;
}

.t-dropdown[data-popper-placement^="left"] {
  transform-origin: right center;
}
```

For Base UI popovers/menus, remove the hard-coded `data-origin="top-left"` so `.t-dropdown` can use `var(--transform-origin, top left)`.

## Repo conventions to follow

- Base UI is used in `packages/propel/src/popover/root.tsx` and `packages/propel/src/menu/menu.tsx`; Base UI's transform origin variable is the right source of truth.
- Popper-based HeadlessUI menus already spread `attributes.popper` onto the dropdown element in `packages/ui/src/dropdowns/custom-menu.tsx:227`, so CSS can read `data-popper-placement`.
- Keep the existing `data-origin` escape hatch for places that deliberately set an origin.

## Steps

1. In `packages/tailwind-config/index.css`, replace the `.t-dropdown` origin block with the Target CSS. Keep existing open/closing selectors unchanged.
2. In `packages/propel/src/popover/root.tsx`, delete `data-origin="top-left"` from `BasePopover.Popup`.
3. In `packages/propel/src/menu/menu.tsx`, delete `data-origin="top-left"` from `BaseMenu.Popup`.
4. In `packages/ui/src/dropdowns/context-menu/item.tsx`, remove `data-origin="top-left"` from the nested submenu dropdown so Popper placement can drive the origin.
5. Leave explicit `data-origin` values alone in call sites that are not Popper/Base UI positioned.

## Boundaries

- Do NOT change menu positioning, offsets, z-indexes, portals, or outside-click behavior.
- Do NOT add a motion library.
- Do NOT change modal origins; centered modals are correctly `transform-origin: center`.
- If a dropdown has no `data-popper-placement`, no Base UI `--transform-origin`, and no explicit `data-origin`, it should keep the fallback `top left`.

## Verification

- **Mechanical**: run `pnpm check:types --filter=@plane/propel` and `pnpm check:types --filter=@plane/ui` if those filters exist; otherwise run `pnpm check:types`.
- **Feel check**: in Storybook or the app, open:
  - a bottom-start menu and confirm it grows from the top-left edge near the trigger;
  - a bottom-end menu and confirm it grows from the top-right edge;
  - a top-positioned menu near the viewport bottom and confirm it grows from its bottom edge;
  - a Base UI popover and confirm it uses the trigger-side origin from Base UI.
    In DevTools, slow animations to 10% and confirm no popover scales from center or the wrong corner.
- **Done when**: positioned popovers visually originate from their trigger edge, while centered modals remain centered.
