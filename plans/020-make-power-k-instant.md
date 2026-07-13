# 020 — Make Power K open instantly

- **Status**: DONE
- **Commit**: 841bb4897b
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, small

## Problem

The Power K command palette is a keyboard-triggered, high-frequency control. Per the animation audit rules, command palette toggles are in the "100+ times/day" bucket and should not animate. Today both the backdrop and panel animate, and close cleanup waits for the 200ms animation:

```tsx
// apps/web/core/components/power-k/ui/modal/wrapper.tsx:108 — current
useEffect(() => {
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  if (!isOpen) {
    resetTimer = setTimeout(() => {
      setSearchTerm("");
      setActivePage(null);
      context.setActiveCommand(null);
      context.setShouldShowContextBasedActions(true);
    }, 200);
  }

  return () => {
    if (resetTimer) clearTimeout(resetTimer);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isOpen]);
```

```tsx
// apps/web/core/components/power-k/ui/modal/wrapper.tsx:128 — current
<Transition.Root show={isOpen} as={React.Fragment}>
  <Dialog as="div" className="relative z-50" onClose={onClose}>
    {/* Backdrop */}
    <Transition.Child
      as={React.Fragment}
      enter="transition-opacity duration-[var(--motion-control-dur)] ease-[var(--motion-standard-ease)]"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity duration-[var(--motion-fast-dur)] ease-[var(--motion-control-ease)]"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div className="fixed inset-0 bg-backdrop" />
    </Transition.Child>
```

```tsx
// apps/web/core/components/power-k/ui/modal/wrapper.tsx:145 — current
<Transition.Child
  as={React.Fragment}
  enter=""
  enterFrom=""
  enterTo="is-open"
  leave=""
  leaveFrom="is-open"
  leaveTo="is-closing"
>
  <Dialog.Panel
    data-theme={surfaceTheme}
    className="divide-opacity-10 t-modal relative flex w-full max-w-2xl transform flex-col items-center justify-center divide-y divide-subtle-1 rounded-[18px] border-[0.5px] border-strong bg-surface-1 text-primary shadow-raised-200"
  >
```

## Target

Power K should mount and unmount immediately: no scale, no fade, no leave delay. Remove `Transition` from this wrapper, return `null` when closed, reset state synchronously on close, and remove `t-modal`/`transform` from the palette panel.

```tsx
// target import
import { Dialog } from "@headlessui/react";
```

```tsx
// target reset
useEffect(() => {
  if (isOpen) return;

  setSearchTerm("");
  setActivePage(null);
  context.setActiveCommand(null);
  context.setShouldShowContextBasedActions(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isOpen]);
```

```tsx
// target render shape
if (!isOpen) return null;

return (
  <Dialog as="div" className="relative z-50" onClose={onClose}>
    <div className="fixed inset-0 bg-backdrop" />
    <div className="fixed inset-0 z-30 overflow-y-auto">
      <div className="flex items-center justify-center p-4 sm:p-6 md:p-20">
        <Dialog.Panel
          data-theme={surfaceTheme}
          className="divide-opacity-10 relative flex w-full max-w-2xl flex-col items-center justify-center divide-y divide-subtle-1 rounded-[18px] border-[0.5px] border-strong bg-surface-1 text-primary shadow-raised-200"
        >
```

## Repo conventions to follow

- Power K keyboard handling already lives in `apps/web/core/components/power-k/ui/modal/wrapper.tsx:71`; keep the existing Cmd/Ctrl+K and Escape behavior unchanged.
- Shared modal animation for occasional modals lives in `packages/tailwind-config/index.css:345`; do not change it for this plan. This is a command palette exception based on frequency.

## Steps

1. In `apps/web/core/components/power-k/ui/modal/wrapper.tsx`, remove `Transition` from the HeadlessUI import.
2. Replace the delayed close reset with the synchronous `useEffect` shown in Target.
3. Add `if (!isOpen) return null;` just before the returned JSX.
4. Replace `<Transition.Root>` and both `<Transition.Child>` wrappers with the plain `Dialog` structure shown in Target.
5. Remove `t-modal` and `transform` from the `Dialog.Panel` class list.

## Boundaries

- Do NOT change Power K filtering, command selection, keyboard shortcuts, or page navigation.
- Do NOT change shared `.t-modal` CSS.
- Do NOT animate the backdrop as a compromise; this palette should be instant.
- If the file has drifted enough that `Transition` still wraps unrelated children, STOP and report instead of improvising.

## Verification

- **Mechanical**: run `pnpm check:types --filter=@plane/web` if that filter exists; otherwise run `pnpm check:types`. Expected: no new type errors from the wrapper import or JSX shape.
- **Feel check**: run the web app, press Cmd/Ctrl+K repeatedly, and confirm:
  - the palette appears on the same frame as the shortcut, with no scale or fade;
  - Escape and Cmd/Ctrl+K close it immediately;
  - reopening after closing shows an empty search and the root command page;
  - keyboard focus still lands in the command input.
- **Done when**: Power K has no visible open/close animation and no delayed state reset remains.
