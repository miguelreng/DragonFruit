# Plan 025: Make a published wiki visible — success step, link access, unpublish clarity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 841bb4897b..HEAD -- apps/web/core/components/docs apps/web/helpers/page-public.ts apps/web/helpers/wiki-appearance.ts`
>
> The wiki feature this plan builds on is uncommitted work from 2026-07-12
> (import modal, folder-menu Create wiki / Wiki settings, published reader).
> Compare the "Current state" excerpts against the live code before starting;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (direct user feedback: "after creating the wiki it's not
  clear what it does, where the link is, where to turn it off")
- **Effort**: S–M
- **Risk**: LOW (frontend-only, no backend or data-shape changes)
- **Depends on**: the built wiki feature (plan 019 + folder publish work,
  currently uncommitted on `main`)
- **Category**: UX / discoverability
- **Planned at**: commit `841bb4897b` (dirty tree), 2026-07-12

## Why this matters

Creating a wiki today ends in a transient toast. The folder card looks
identical before and after publishing, the public link is only visible inside
the Wiki settings modal, and unpublishing requires knowing the settings modal
exists. Every part of the lifecycle works, but none of it is visible:

1. **After creating** - the modal closes immediately; nothing on screen says
   what just happened or where the wiki lives.
2. **At a glance** - published and private folders render identically in the
   gallery and list views.
3. **Managing** - copying the link or turning the wiki off takes two hops
   (hover → ··· → Wiki settings) with no hint that the entry point exists.

## Current state

All paths relative to `apps/web/`.

- `core/components/docs/wiki-settings-modal.tsx` - one-mode modal. Saving
  shows a toast and immediately closes:

```tsx
// wiki-settings-modal.tsx:124 (inside handleSave)
setToast({
  type: TOAST_TYPE.SUCCESS,
  title: isCreateFlow && isPublished ? "Wiki created" : "Wiki settings saved",
  message: isPublished ? buildPublicPagePath(workspaceSlug, publicSlug) : undefined,
});
await onSaved();
onClose();
```

```tsx
// wiki-settings-modal.tsx:54 - create vs settings flow flag
const isCreateFlow = folder.access !== EPageAccess.PUBLIC;
```

- `core/components/docs/workspace-docs-root.tsx` - folder surfaces already
  receive `isWikiPublished` (threaded to `FolderCard`, `FolderListItem`, and
  `FolderActionsMenu`) but only the menu label uses it:

```tsx
// workspace-docs-root.tsx:1687 - grid card meta line
const metaText = [projectName, `${count} ${count === 1 ? "doc" : "docs"}`].filter(Boolean).join(" · ");

// workspace-docs-root.tsx:1780 - list row meta
{isDropTargetActive ? "Drop to move here" : `${count} ${count === 1 ? "doc" : "docs"}`}

// workspace-docs-root.tsx:1406 - the single dynamic wiki menu item
{isWikiPublished ? <Settings className="size-4" /> : <FolderPlus className="size-4" />}
{isWikiPublished ? "Wiki settings" : "Create wiki"}
```

```tsx
// workspace-docs-root.tsx:840 - drill-in breadcrumb for the active folder
<Breadcrumbs.Item component={<BreadcrumbLink label={getPageName(activeFolder.name)} />} />
```

- `helpers/page-public.ts` exports `getPublicPageSlug`, `buildPublicPagePath`,
  `buildPublicPageUrl`, `normalizePublicPageSlug`, `validatePublicPageSlug`.
- `copyUrlToClipboard` comes from `@plane/utils` (already imported in
  `workspace-docs-root.tsx`).
- Published = `folder.access === EPageAccess.PUBLIC`. The public reader link
  is `/published/<workspaceSlug>/<public_slug || folder.id>`.

Repo conventions that apply:

- Work directly on `main`; no branches or worktrees. Do not commit or push
  unless the user explicitly asks.
- Icons from the existing `@/components/icons/lucide-shim` exports (a `Globe`
  export exists; verify before use, add a Solar shim alias only if missing).
- The web app has no unit-test runner: verify with typecheck, lint, and the
  runtime smoke below.
- NOTE: an unrelated session may hold in-progress edits elsewhere in the tree;
  judge typecheck output by errors in the files this plan touches.

## Commands you will need

| Purpose        | Command                                    | Expected on success                                |
| -------------- | ------------------------------------------ | -------------------------------------------------- |
| Web typecheck  | `pnpm turbo run check:types --filter=web`  | exit 0 (or no errors in files touched by this plan) |
| Web lint       | `pnpm turbo run check:lint --filter=web`   | exit 0 (same caveat)                                |
| Dev smoke      | launch.json `web-local-api (folders verify)` (port 3005) + local Django API on :8000 | app reachable, sign in per `plans`/memory notes |

## Scope

**In scope**:

- `apps/web/core/components/docs/wiki-settings-modal.tsx`
- `apps/web/core/components/docs/workspace-docs-root.tsx`

**Out of scope**:

- No backend changes (publish/unpublish/link already work).
- No changes to the published reader (`published-wiki-view.tsx`).
- No changes to the import flow (`import/wiki-import-modal.tsx`).
- No new dependencies.

## Product decisions

1. **Success step in the modal.** After a save that takes an unpublished
   folder live (`isCreateFlow && isPublished`), the modal does NOT close. It
   swaps to a success view: "Wiki is live" headline, the full public URL in a
   read-only row with a Copy button, the published doc count, and the line
   "Manage order, colors, or unpublish anytime from ··· → Wiki settings on
   this folder." The PRIMARY button is **"View wiki"** (opens the published
   reader in a new tab — seeing the artifact is the confirmation); "Done" is
   the secondary close. Plain settings saves (already-published wikis, or
   saves with publish off) keep today's toast-and-close behavior.
2. **Persistent "Published" marker.** Folder grid cards and list rows show a
   small globe + "Published" alongside the doc count when the folder is
   public. Muted styling (`text-tertiary`), not a loud badge.
3. **One-click link copy.** Published folders get a "Copy wiki link" item in
   the ··· menu between the wiki item and Delete. No modal required.
4. **Drill-in awareness.** Inside a published folder, a small "Published"
   chip renders next to the breadcrumb; clicking it copies the link
   (`title="Copy wiki link"`).
5. **Unpublish stays in settings** (the toggle), but the settings modal for a
   live wiki gains one helper line under the toggle: "This wiki is live.
   Turning this off takes the link offline." No separate unpublish button.

## Steps

### Step 1: Success step in `wiki-settings-modal.tsx`

Add a phase state:

```tsx
const [phase, setPhase] = useState<"form" | "published">("form");
```

- Reset `phase` to `"form"` in the existing open-reseed effect.
- In `handleSave`, on success: `await onSaved();` then, if
  `isCreateFlow && isPublished`, `setPhase("published")` and DO NOT call
  `onClose()` (skip the toast for this path - the success view replaces it).
  Otherwise keep the current toast + `onClose()`.
- Render: when `phase === "published"`, replace the modal body and footer
  with the success view (decision 1). Reuse `publicUrl`, `copyUrlToClipboard`,
  and the existing button styles. Footer: primary `<a>` styled as a primary
  Button ("View wiki", `href={buildPublicPagePath(...)}`, `target="_blank"`,
  `rel="noopener noreferrer"`) + secondary "Done" calling `onClose()`.
- Keep the header but let it read "Wiki is live" in this phase.

Note: after `onSaved()` refreshes the pages list, the `folder` prop object in
state is stale (access still PRIVATE) - do not derive the success view from
`folder.access`; drive it purely off the `phase` state.

**Verify**: typecheck passes (no errors in this file).

### Step 2: Published marker on folder card + list row

In `workspace-docs-root.tsx`:

- `FolderCard`: extend the meta line so a published folder reads
  `"<project> · N docs · Published"`. Implementation: keep `metaText` for the
  drop-target swap, and when `isWikiPublished` render a trailing
  `<Globe className="size-3" /> Published` inline (flex row with gap) in the
  same `text-11 text-placeholder` tone.
- `FolderListItem`: same treatment in the `actionableItems` meta span.

Both components already receive `isWikiPublished` - no new threading.

**Verify**: typecheck; visually in Step 6.

### Step 3: "Copy wiki link" menu item

- `FolderActionsMenu`: new optional prop `onCopyWikiLink?: () => void`;
  render the item only when `isWikiPublished && onCopyWikiLink`, placed
  between the wiki item and Delete, icon `Copy` (aliased `Copy01Icon` is
  already imported in this file; reuse it), label "Copy wiki link".
- Thread from both call sites:

```tsx
onCopyWikiLink={() => {
  void copyUrlToClipboard(buildPublicPageUrl(workspaceSlug, getPublicPageSlug(folder))).then(() =>
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Wiki link copied" })
  );
}}
```

- Import `getPublicPageSlug` / `buildPublicPageUrl` from
  `@/helpers/page-public` (not currently imported in this file).

**Verify**: typecheck; runtime in Step 6.

### Step 4: Drill-in "Published" chip

In the breadcrumb block (workspace-docs-root.tsx:826-848), when
`activeFolder` is set and `activeFolder.access === EPageAccess.PUBLIC`,
render after the count pill:

```tsx
<button
  type="button"
  title="Copy wiki link"
  onClick={() => void copyUrlToClipboard(buildPublicPageUrl(workspaceSlug, getPublicPageSlug(activeFolder))).then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: "Wiki link copied" }))}
  className="flex items-center gap-1 rounded-full bg-layer-1 px-1.5 py-px text-11 font-medium text-tertiary hover:text-primary"
>
  <Globe className="size-3" />
  Published
</button>
```

**Verify**: typecheck.

### Step 5: Unpublish helper copy in settings mode

In `wiki-settings-modal.tsx`, under the Publish toggle row, when
`!isCreateFlow` (wiki already live) and `isPublished`, render:
`<p className="text-11 text-tertiary">This wiki is live. Turning this off takes the link offline.</p>`

**Verify**: typecheck + lint both clean for touched files.

### Step 6: Runtime smoke

Stack: launch.json `web-local-api (folders verify)` + local Django API
(:8000, localhost env overrides). Sign in as `testdebug@plane.so`
(`Claude-debug-123!`), project "Folder Test". The "Field Guide" folder from
the previous session may already exist - unpublish it first via Wiki settings
so both states can be exercised, or create a fresh folder with 2-3 docs.

1. Unpublished folder → ··· shows "Create wiki" and NO "Copy wiki link";
   card/list shows no Published marker.
2. Create wiki → modal switches to the success view (link row + Copy + Open +
   management hint + Done). No premature close.
3. Copy in the success view → clipboard toast; "View wiki" (primary) → the
   published reader opens in a new tab.
4. Done → gallery shows the folder with "· Published" (grid AND list view).
5. ··· now shows "Wiki settings" + "Copy wiki link"; the latter copies and
   toasts without opening a modal.
6. Drill into the folder → "Published" chip next to the count; clicking
   copies the link.
7. Wiki settings → helper line under the toggle; toggle off + save → marker,
   menu item, and chip all disappear; public URL 404s.
8. Re-publish for good measure; confirm the success step shows again.

**Verify**: every item above observed; screenshot the success view and the
published card for the report.

## Test plan

- Static: typecheck + lint (judge by files in scope, per the concurrent-work
  caveat).
- Runtime: the Step 6 checklist. No API contract changes to test.

## Done criteria

- [ ] Creating a wiki ends on an in-modal success view with the link, Copy,
      Open, a management hint, and Done - not a bare toast.
- [ ] Published folders are visually distinct (grid card + list row) via the
      muted "Published" marker.
- [ ] "Copy wiki link" exists in the ··· menu for published folders only.
- [ ] The drill-in header shows a copyable "Published" chip for live wikis.
- [ ] Settings mode explains that toggling publish off takes the link offline.
- [ ] Unpublishing removes every marker and the menu item; the link 404s.
- [ ] Typecheck + lint clean for touched files.
- [ ] `plans/README.md` row for 025 updated.

## STOP conditions

Stop and report back if:

- The drift check shows the wiki feature files changed since this plan was
  written and the "Current state" excerpts no longer match.
- `isWikiPublished` is no longer threaded to `FolderCard` / `FolderListItem`
  (a refactor landed) - re-derive the plan instead of re-threading blindly.
- The lucide-shim has no `Globe` export and adding one requires anything
  beyond a one-line Solar alias.
- The modal cannot hold a second phase without restructuring `ModalCore`
  usage.
- Typecheck or lint fails twice in the touched files after reasonable fixes.

## Maintenance notes

- The success view is the natural place to later add "Share to Slack" or a QR
  code - keep it a distinct phase, not an overloaded form state.
- If folders ever surface on the workspace-level gallery with different
  permissions, the Published marker still reads from `access` and needs no
  change.
- If a dedicated "Unpublish" button is requested later, put it in the success
  view's footer as a secondary action, not in the menu.

Known-and-accepted UX debt (deliberately out of scope here; candidates for a
follow-up plan if the wiki feature grows):

- **Share popover (v2 consolidation).** This plan spreads wiki state across a
  menu item, a chip, and a modal. The stronger pattern is one popover (opened
  from any "Published" marker) holding live-status, link, copy, "View wiki",
  and "Wiki settings" - Notion's share-to-web shape. Build it only if the
  scattered affordances prove confusing in practice.
- **Preview before publish.** "Create wiki" pre-toggles publish ON and the
  reader is only reachable once public, so users arrange order/accent blind.
  A real fix needs an owner-authenticated preview of the reader (authed
  variant of the public endpoint or a client-side preview off the authed
  pages API) - genuine scope, do not bolt it onto this plan.
