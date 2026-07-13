# 022 — Remove layout transitions from default primitives

- **Status**: DONE
- **Commit**: 841bb4897b
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 3 files, small

## Problem

The shared `t-resize` primitive animates `width` and `height`, then the default button and card helpers apply it everywhere. Width/height transitions trigger layout and paint, and `will-change: width, height` on high-cardinality controls is expensive even when dimensions rarely change.

```css
/* packages/tailwind-config/index.css:179 — current */
.t-resize {
  transition:
    width var(--resize-dur) var(--resize-ease),
    height var(--resize-dur) var(--resize-ease);
  will-change: width, height;
}
```

```tsx
// packages/ui/src/button/helper.tsx:31 — current
enum buttonSizeStyling {
  sm = `t-resize t-colors px-2.5 py-1 font-medium text-11 rounded-lg flex items-center gap-1.5 whitespace-nowrap justify-center`,
  md = `t-resize t-colors px-3 py-1 font-medium text-13 rounded-lg flex items-center gap-1.5 whitespace-nowrap justify-center`,
  lg = `t-resize t-colors px-4 py-1.5 font-medium text-13 rounded-lg flex items-center gap-1.5 whitespace-nowrap justify-center`,
  xl = `t-resize t-colors px-4 py-2.5 font-medium text-13 rounded-lg flex items-center gap-1.5 whitespace-nowrap justify-center`,
}
```

```tsx
// packages/propel/src/button/helper.tsx:10 — current
export const buttonVariants = cva(
  "t-resize t-colors inline-flex items-center justify-center gap-1 whitespace-nowrap focus-visible:outline-none disabled:pointer-events-none",
```

```tsx
// packages/ui/src/card/helper.tsx:27 — current
const DEFAULT_STYLE = "t-resize t-colors bg-surface-1 rounded-xl border-[0.5px] border-subtle w-full flex flex-col";
```

## Target

Default buttons and cards should animate only color/shadow/opacity and optional press transforms. Leave `t-resize` available for rare layout-specific surfaces, but remove it from high-cardinality primitives.

```tsx
// target packages/ui/src/button/helper.tsx
enum buttonSizeStyling {
  sm = `t-colors px-2.5 py-1 font-medium text-11 rounded-lg flex items-center gap-1.5 whitespace-nowrap justify-center`,
  md = `t-colors px-3 py-1 font-medium text-13 rounded-lg flex items-center gap-1.5 whitespace-nowrap justify-center`,
  lg = `t-colors px-4 py-1.5 font-medium text-13 rounded-lg flex items-center gap-1.5 whitespace-nowrap justify-center`,
  xl = `t-colors px-4 py-2.5 font-medium text-13 rounded-lg flex items-center gap-1.5 whitespace-nowrap justify-center`,
}
```

```tsx
// target packages/propel/src/button/helper.tsx
export const buttonVariants = cva(
  "t-colors inline-flex items-center justify-center gap-1 whitespace-nowrap focus-visible:outline-none disabled:pointer-events-none",
```

```tsx
// target packages/ui/src/card/helper.tsx
const DEFAULT_STYLE = "t-colors bg-surface-1 rounded-xl border-[0.5px] border-subtle w-full flex flex-col";
```

## Repo conventions to follow

- `t-press` already supplies transform feedback for pressable Propel buttons in `packages/propel/src/button/button.tsx:35`.
- `t-colors` is the shared non-layout transition primitive in `packages/tailwind-config/index.css:186`.
- Existing layout-specific uses of `t-resize` include app frames and expanding setup panels; leave those for a separate deliberate pass.

## Steps

1. Remove `t-resize` from all four `buttonSizeStyling` entries in `packages/ui/src/button/helper.tsx`.
2. Remove `t-resize` from the base `cva` class string in `packages/propel/src/button/helper.tsx`.
3. Remove `t-resize` from `DEFAULT_STYLE` in `packages/ui/src/card/helper.tsx`.
4. Do not edit `.t-resize` itself in this plan.

## Boundaries

- Do NOT change button sizing, padding, typography, variants, or disabled behavior.
- Do NOT remove `t-resize` from layout containers or onboarding expanders in this plan.
- Do NOT replace width/height animation with `transition-all`.
- If visual regression appears because a specific button truly needs width animation, add `t-resize` only at that specific call site and document why.

## Verification

- **Mechanical**: run `pnpm check:types --filter=@plane/ui` and `pnpm check:types --filter=@plane/propel` if available; otherwise run `pnpm check:types`.
- **Feel check**: hover and press shared UI and Propel buttons:
  - hover colors still ease smoothly;
  - Propel non-link buttons still scale on press through `t-press`;
  - buttons no longer advertise `will-change: width, height` in computed styles;
  - cards still transition color/shadow but do not animate dimensions.
- **Done when**: default buttons/cards no longer include layout-transition classes and no common button hover/press behavior regresses.
