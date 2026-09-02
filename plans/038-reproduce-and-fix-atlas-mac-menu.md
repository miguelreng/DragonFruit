# Plan 038: Reproduce and fix the Atlas Mac App menu bug

> **Executor instructions**: The backlog item names no symptom. Reproduction is
> mandatory before any fix. Do not refactor SwiftUI menu code speculatively.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- apps/Copilot/Sources/DragonFruitMiniApp.swift apps/Copilot/Sources/MeetingPopoverView.swift apps/Copilot/DragonFruitMini.xcodeproj`

## Status

- **Priority**: P1 once reproducible
- **Effort**: S–M
- **Risk**: MED
- **Depends on**: a reproducible symptom and expected behavior
- **Category**: bug
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Why this matters

Menu-bar failures can make the entire Mac companion inaccessible, but “Atlas Mac
App menu” is not enough information to identify a root cause. The app has both a
`MenuBarExtra` window and nested SwiftUI `Menu` controls, so changing either
without a reproduction could fix the wrong interaction.

## Current state

- `DragonFruitMiniApp.swift:36-75` owns a SwiftUI `MenuBarExtra` with
  `.menuBarExtraStyle(.window)`.
- Controller binding occurs from `onAppear` on both content and label.
- `MeetingPopoverView.swift:92-122` contains the authenticated header overflow
  `Menu` with Log out.
- Additional Settings menus exist later in the same view.
- There is no UI-test target that exercises menu-bar open/dismiss/reopen.

## Required reproduction record

Before source changes, record:

- exact control: menu-bar icon, header ellipsis, Settings menu, or another menu;
- actual and expected behavior;
- whether it occurs before/after login;
- macOS and app build versions;
- first-open vs reopen, single vs multiple displays, and keyboard vs pointer;
- screen recording plus relevant Console log excerpt.

Store the concise finding in `plans/038-atlas-mac-menu-findings.md`.

## Scope

**In scope after reproduction**:

- `apps/Copilot/Sources/DragonFruitMiniApp.swift`
- `apps/Copilot/Sources/MeetingPopoverView.swift`
- A new narrow helper/test file under `apps/Copilot/Tests/` only if the bug can
  be isolated from AppKit UI timing
- `plans/038-atlas-mac-menu-findings.md`

**Out of scope**:

- Redesigning the whole popover.
- Replacing `MenuBarExtra` without evidence it is the failing layer.
- Changing authentication, audio capture, Atlas chat, or updater behavior.

## Steps

### Step 1: Run the reproduction matrix

Test launch, first open, outside-click dismiss, second open, Escape dismiss,
display change, light/dark mode, login/logout, header ellipsis, and every
Settings submenu. Repeat on the oldest and newest supported macOS versions when
available.

**Verify**: one failure reproduces twice with identical steps, or the plan stops
with “not reproduced” and the completed matrix.

### Step 2: Isolate the failing ownership layer

Use temporary diagnostic logging, not behavior changes, to determine whether the
failure belongs to scene lifecycle, focus/window activation, duplicate
`onAppear` side effects, or nested `Menu` state. Remove temporary logs before
completion.

**Verify**: the findings document names one failing lifecycle/state transition
and points to the responsible symbol.

### Step 3: Make the narrowest fix

Modify only the failing layer. If controller binding is involved, make binding
idempotent and owned by one lifecycle. If nested menu state is involved, keep
the menu action semantics unchanged.

**Verify**:

```bash
xcodebuild -project apps/Copilot/DragonFruitMini.xcodeproj \
  -scheme DragonFruitMini -configuration Debug \
  CODE_SIGNING_ALLOWED=NO build
```

→ `BUILD SUCCEEDED`.

### Step 4: Repeat the full matrix

Repeat Step 1, including the unaffected menus and logout/update actions.

**Verify**: original repro is fixed, no matrix regression appears, and the app
survives five open/dismiss/reopen cycles.

## Done criteria

- [ ] A precise reproduction and root cause are documented.
- [ ] The fix touches only the evidenced ownership layer.
- [ ] `xcodebuild` succeeds.
- [ ] The full menu matrix passes after the fix.

## STOP conditions

- The bug cannot be reproduced twice.
- The reporter cannot identify which menu/control fails.
- The fix appears to require a wholesale scene architecture replacement.
- Testing requires signing/release credentials not available to the executor.

