# Plan 037: Redesign the event view modal around event actions and context

> **Executor instructions**: Preserve create/update semantics and Google
> Calendar payloads. This is an information-hierarchy and component-extraction
> change, not a calendar data rewrite.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- apps/web/core/components/calendar/calendar-root.tsx apps/web/core/services/calendar.service.ts`
> The calendar files are currently dirty; read and preserve the live changes
> before implementing this plan.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Why this matters

The current view modal is a stack of labels with five footer buttons, while edit
mode jumps from an MD to an XXL modal and duplicates the new-event form. A
stable shell with a clear primary action makes event details easier to scan and
reduces form drift without changing Calendar API behavior.

## Current state

- `calendar-root.tsx:1969-2256` contains `GoogleEventDetailsModal`.
- View mode uses an MD modal; edit mode returns a separate XXL modal.
- `calendar-root.tsx:2259+` contains `NewEventModal` with duplicated title,
  all-day, start/end, description, and validation behavior.
- Event update already handles all-day inclusive dates, timezone, API errors,
  and local refresh. Those semantics must be preserved.

## Target design

- One responsive modal shell that does not resize when switching View/Edit.
- Header: calendar color/name, event title, close, and overflow actions.
- Body: icon-led rows for time/timezone, location, meeting link, and
  description; omit empty rows.
- Primary CTA is **Join meeting** when available, otherwise **Open in Google
  Calendar**. Edit and Create task are secondary actions; Close is the chrome,
  not a footer button.
- Edit uses the same shell and shared event-fields component. Cancel restores
  the event snapshot.
- Mobile stacks date/time fields and pins no oversized footer.

## Scope

**In scope**:

- `apps/web/core/components/calendar/calendar-root.tsx`
- `apps/web/core/components/calendar/event-modal/event-modal.tsx` (create)
- `apps/web/core/components/calendar/event-modal/event-form.tsx` (create)
- `apps/web/core/components/calendar/event-modal/event-utils.ts` (create)
- `apps/web/core/components/calendar/event-modal/event-utils.test.ts` (create)
- `apps/web/core/components/calendar/event-modal/event-modal.stories.tsx` (create if Storybook can render without app stores)

**Out of scope**:

- Calendar API/schema changes.
- Deleting events, attendee management, recurrence editing, or reminders.
- Redesigning the calendar grid.
- Rendering raw Google description HTML.

## Steps

### Step 1: Extract and test event transformations

Move HTML-to-plain-text, start/end field conversion, all-day inclusive-end
handling, and end-after-start validation into pure helpers. Test timed,
all-day, timezone fallback, empty description, and invalid ranges.

**Verify**:
`pnpm --filter=web test:unit -- --run apps/web/core/components/calendar/event-modal/event-utils.test.ts`
→ all tests pass.

### Step 2: Build the stable modal shell

Create the view hierarchy above using existing `@plane/ui` and Solar icon
primitives. Keep links external with `noopener`. Provide loading/disabled states
that prevent duplicate update requests.

**Verify**: Web typecheck exits 0.

### Step 3: Share the form between create and edit

Extract the duplicated fields into `EventForm`. Keep create-only calendar
selection and edit-only immutable source details as explicit props. Use one
validated form value shape, while keeping the existing service payload shape at
the call sites.

**Verify**: focused helper tests and Web typecheck pass.

### Step 4: Replace the inline modal implementations

Wire the extracted modal into `calendar-root.tsx`, preserving callbacks,
optimistic/local refresh, toasts, timezone labels, and Create task behavior.
Delete only code proven dead by the replacement.

**Verify**: `pnpm --filter=web check:types` and `pnpm --filter=web test:unit` pass.

### Step 5: Visual and keyboard smoke

Cover timed, all-day, long title, long description, location, Meet link,
read-only calendar, editable calendar, API error, mobile width, Escape, Tab
order, and returning from Edit to View without a size jump.

## Execution evidence — 2026-07-30

- View and Edit now use the same `XXL` responsive, height-bounded modal shell;
  switching modes no longer resizes the dialog.
- View mode uses icon-led rows for time, location, meeting, and description,
  omits absent details, and moves close into the header chrome.
- Join meeting is the primary action when present; otherwise Open in Google
  Calendar is primary. Edit and Create task remain secondary.
- Extracted HTML-to-text, timezone field conversion, inclusive all-day end,
  range validation, and display formatting helpers. All 20 focused tests pass.
- Update payload, refresh, toast, error, and Cancel snapshot behavior remain at
  the existing call site. Global Web typecheck passes.
- A required bounded UI collaborator pass timed out twice without returning
  text; its narrow helper files were reviewed and integrated locally.
- Shared Create/Edit form fields are not yet extracted. Signed-in visual and
  keyboard smoke is blocked by the unavailable local API/auth stack.

## Done criteria

- [x] View/Edit share one stable responsive shell.
- [x] Primary/secondary actions follow the target hierarchy.
- [ ] Create and Edit share field and validation code.
- [x] Calendar payloads and refresh behavior are unchanged.
- [ ] Tests, typecheck, and the visual/keyboard matrix pass.

## STOP conditions

- The live dirty calendar changes conflict with this extraction.
- Existing event payload behavior cannot be preserved without an API change.
- The Storybook environment requires app-level authentication; omit only the
  story and record the reason, but do not omit runtime visual QA.
