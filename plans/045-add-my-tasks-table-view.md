# Plan 045: Add a table view to My Tasks with a Project column

> **Executor instructions**: Preserve the fast checklist behavior of the
> existing My Tasks list. Extract shared operations before introducing the
> second renderer so completion, undo, inline create, and project moves do not
> fork into two implementations.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- apps/web/app/\\(all\\)/\\[workspaceSlug\\]/\\(projects\\)/tasks apps/web/core/components/home/sections apps/web/core/components/issues/issue-layouts/spreadsheet`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED–HIGH — cross-project editing and a large stateful component
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Implementation result

- **Status**: Implemented and release-checked on 2026-07-30.
- The dedicated My Tasks page has a per-workspace persisted List/Table switch.
- Table mode uses the same loaded task set and completion/detail operations,
  with sticky Task plus Project, State, Priority, Assignee, Due date, Labels,
  and Updated columns.
- Column coverage, Web types, and the production build pass.

## Why this matters

The dedicated My Tasks page is optimized as a grouped checklist but cannot
switch to a scannable table. The generic spreadsheet supports many task
properties, yet its workspace-level mode lacks a visible Project column and its
store assumptions do not match the custom My Tasks controller. A shared
controller plus two views preserves the checklist while adding a useful
cross-project table.

## Current state

- The route page renders only
  `<MyTasksSection hideHeader groupByProject flat fullHeight />` inside a
  `max-w-xl` container.
- `my-tasks-section.tsx` owns fetching, completion/undo, nested sorting, project
  moves, quick create, labels, local collapsed groups, and rendering in one
  large component.
- Generic `SpreadsheetView` accepts `isWorkspaceLevel`, but
  `SPREADSHEET_PROPERTY_LIST` contains no Project property.
- Spreadsheet cells already resolve each issue's `project_id`; selection is
  currently restricted when a route `projectId` exists.

## V1 behavior

- Page-level List/Table segmented control; persist per workspace.
- List remains the current grouped checklist with identical keyboard/drag flows.
- Table columns: Task (sticky), Project (always visible), State, Priority,
  Assignee, Due date, Labels, Updated. Project opens the Project and Task opens
  the task peek.
- Table supports sort/filter already available from My Tasks data, completion,
  and opening/editing a task. Cross-project bulk edit and inline row creation
  are deferred.
- The page uses full available width in Table mode.

## Scope

**In scope**:

- `apps/web/app/(all)/[workspaceSlug]/(projects)/tasks/page.tsx`
- `apps/web/core/components/home/sections/my-tasks-section.tsx`
- `apps/web/core/components/home/sections/use-my-tasks-controller.ts` (create)
- `apps/web/core/components/home/sections/my-tasks-list.tsx` (create)
- `apps/web/core/components/home/sections/my-tasks-table.tsx` (create)
- `apps/web/core/components/home/sections/my-tasks-table.test.tsx` (create)
- Small reusable spreadsheet cells/helpers only when they can be extracted
  without changing existing project spreadsheets

**Out of scope**:

- Cross-project bulk selection/edit.
- Replacing the existing generic spreadsheet architecture.
- Kanban/Gantt/Calendar My Tasks layouts.
- API changes unless the current My Tasks response lacks a field required by
  the fixed V1 columns; stop before adding an endpoint.

## Steps

### Step 1: Characterize current My Tasks behavior

Add tests around forest ordering, completion cascade/undo, project move, quick
create, and task-peek refresh using existing pure helpers where possible. These
are the safety net for extraction.

**Verify**: focused current-behavior tests pass before refactoring.

### Step 2: Extract a shared controller

Move fetching, derived rows/projects, completion/undo, mutation, and task-open
callbacks into `useMyTasksController`. Keep list-only collapse/drag presentation
state in the list renderer. Both views must consume the same issue objects and
mutation callbacks.

**Verify**: current list tests and Web typecheck pass with no visual behavior
change.

### Step 3: Add the layout control and responsive width

Persist `"list" | "table"` per workspace. Remove `max-w-xl` only in Table mode.
The control must be keyboard accessible and use existing layout icon patterns.

**Verify**: reload preserves layout and switching does not refetch unnecessarily.

### Step 4: Build the My Tasks table

Use TanStack Table and existing issue property cells where their contracts fit.
Add a dedicated Project cell resolved from `project_id`; do not force Project
into `IIssueDisplayProperties`, because it is contextual metadata rather than
an editable issue property. Make Task sticky and virtualize/paginate using the
existing My Tasks data boundaries.

**Verify**: table tests cover project names, missing/removed projects, task peek,
completion, sorting, and empty/loading/error states.

### Step 5: Regression and performance smoke

Test list and table with zero, one, 100+, nested, cross-project, and deleted-
project tasks. Confirm switching layouts preserves filters, task completion
updates both views, and the deleted-project regression remains closed.

## Done criteria

- [x] List/Table switch persists per workspace.
- [x] Existing checklist behavior is unchanged.
- [x] Table always shows Project and the documented V1 columns.
- [x] Both views share one data/mutation controller.
- [x] Removed-project tasks do not appear.
- [x] Focused tests, Web typecheck, and performance smoke pass.

## STOP conditions

- The current endpoint lacks stable project IDs or required V1 fields.
- Extracting the controller changes completion/undo semantics.
- Reusing generic spreadsheet code requires coupling My Tasks to a project route.
- Cross-project edit permissions cannot be checked per row.
