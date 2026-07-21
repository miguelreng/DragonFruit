# Plan 029: Show live collaborator avatars, pointers, and selections in Docs, Briefs, and Sheets

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer says they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 14428ae90e..HEAD -- packages/editor apps/live apps/web/core/components/pages apps/web/core/hooks pnpm-workspace.yaml pnpm-lock.yaml`
> If an in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. Stop on a
> material mismatch.

## Status

- **Priority**: P1
- **Effort**: M (roughly 3–5 engineering days including tests and two-browser QA)
- **Risk**: MED — awareness is ephemeral, but the work touches the shared editor connection lifecycle and live-server authorization
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `14428ae90e`, 2026-07-20

## Why this matters

Docs and project Briefs already synchronize content through one Hocuspocus/Yjs
session, but that session exposes no visible collaborator presence. Sheets are
different: they persist a complete JSON snapshot over REST after a 700 ms
debounce and currently have no live channel at all. The desired result is one
consistent presence language across all three surfaces: active-editor avatars,
live labeled mouse pointers, document carets/selections, and sheet cell
selections.

This plan deliberately does **not** market Sheets as convergent multiplayer
editing. Sheet content continues to use its existing REST snapshot persistence;
only ephemeral presence travels over the live server. Migrating sheet data to a
conflict-free model is a separate, larger project because API previews and Atlas
sheet tools read `description_json.sheet_snapshot` directly.

## Current state

- `packages/editor/src/core/hooks/use-yjs-setup.ts:54-109` creates the existing
  Hocuspocus provider for a page and owns reconnect/disconnect behavior:

  ```ts
  const provider = new HocuspocusProvider({
    name: docId,
    token: authToken,
    url: serverUrl,
    onAuthenticationFailed: () => {
      /* ... */
    },
    onConnect: () => {
      /* ... */
    },
    onStatus: ({ status: providerStatus }) => {
      /* ... */
    },
    onSynced: () => {
      /* ... */
    },
  });
  ```

- `packages/editor/src/core/components/editors/document/collaborative-editor.tsx:60-92`
  already provides that non-null provider to both the body and title Tiptap
  editors. `packages/editor/src/core/hooks/use-collaborative-editor.ts:73-110`
  installs `@tiptap/extension-collaboration`, but no collaboration-cursor/caret
  extension.
- `packages/editor/src/core/types/config.ts:42-47` defines the local connection
  identity as `{ id, name, color, cookie? }`; there is no avatar field or
  presence contract.
- `apps/web/core/components/pages/editor/editor-body.tsx:500-532` constructs the
  live URL and deterministic user color. It does not include `avatar_url` and
  keeps this construction private to the Doc/Brief branch.
- `apps/web/core/components/project/brief/brief-root.tsx:297-315` renders the
  Brief through the same `PageRoot` and collaborative document editor as Docs.
  Therefore the document presence implementation must be shared, not copied
  into the Brief.
- `apps/web/core/components/pages/editor/page-root.tsx:179-242` routes Docs to
  `PageEditorBody` and `page_type: "sheet"` pages directly to `SheetEditor`.
- `apps/web/core/components/pages/sheet/sheet-editor.tsx:181-264` initializes
  from `page.description_json` and debounces whole-snapshot REST persistence:

  ```ts
  const [snapshot, setSnapshot] = useState<TSheetSnapshot>(() => getInitialSnapshot(page.description_json));

  const persist = useMemo(
    () =>
      debounce((next: TSheetSnapshot) => {
        handlers.updateDescription({
          description_json: { sheet_snapshot: next },
        });
      }, 700),
    [handlers, page]
  );
  ```

- `apps/web/core/components/pages/sheet/sheet-editor.tsx:1306-1320` has a title
  row with room for an avatar group, and `:1477-1875` renders the scrollable grid
  and individual cells.
- `apps/live/src/lib/auth.ts:24-95` authenticates the cookie/user ID but does not
  currently authorize a presence-only page session. Normal document access is
  effectively checked later when the database extension fetches the page.
- `apps/live/src/extensions/database.ts:26-60` always loads a rich-text binary,
  converting HTML when empty, and `:72-92` always converts the Y.Doc back to
  rich-text formats. A Sheet must never enter these paths.
- `apps/live/src/extensions/redis.ts:24-30` already installs the Hocuspocus Redis
  extension, so awareness updates can fan out across live-server instances.
- `apps/api/plane/app/views/agent/chat.py:1143-1148` explicitly documents Sheets
  as non-Yjs pages, and `apps/api/plane/app/serializers/page.py:270-342` builds
  gallery previews from `description_json.sheet_snapshot`. Do not change either
  contract in this plan.
- Shared avatar primitives already exist at
  `packages/ui/src/avatar/avatar.tsx` and
  `packages/ui/src/avatar/avatar-group.tsx`; reuse them.

### Applicable repository conventions

- Work directly on `main`; do not create a branch or worktree.
- Internal dependencies use `workspace:*`; catalogued external dependencies use
  `catalog:`. If adding the Tiptap cursor extension, add the exact `2.22.3`
  version to the root catalog and reference it as `catalog:` from
  `packages/editor/package.json`.
- Use strict TypeScript and Solar icons only. Presence cursors should be CSS
  shapes and labels, not a new icon dependency.
- Match error handling in `use-yjs-setup.ts`: cleanup listeners in effects,
  guard callbacks after disposal, and log actionable errors.
- Use `Avatar`/`AvatarGroup` from `@plane/ui` rather than creating another avatar
  primitive.
- Tests use Vitest in `apps/web` and `apps/live`. All feature logic that can be
  pure should be extracted and unit-tested instead of requiring brittle DOM
  snapshots.

## Commands you will need

| Purpose        | Command                                                     | Expected on success          |
| -------------- | ----------------------------------------------------------- | ---------------------------- |
| Editor types   | `pnpm --filter=@plane/editor check:types`                   | exit 0, no TypeScript errors |
| Editor build   | `pnpm --filter=@plane/editor build`                         | exit 0                       |
| Live tests     | `pnpm --filter=live test`                                   | all tests pass               |
| Live types     | `pnpm --filter=live check:types`                            | exit 0                       |
| Web unit tests | `pnpm --filter=web test:unit`                               | all tests pass               |
| Web types      | `pnpm --filter=web check:types`                             | exit 0                       |
| Focused lint   | `pnpm exec oxlint --deny-warnings <changed .ts/.tsx files>` | exit 0, no warnings          |
| Final checks   | `pnpm check`                                                | exit 0                       |

## Scope

**In scope** (only these areas may change):

- `packages/editor/src/core/types/config.ts`
- `packages/editor/src/core/types/editor.ts`
- `packages/editor/src/core/types/collaboration.ts`
- `packages/editor/src/core/contexts/collaboration-context.tsx`
- `packages/editor/src/core/hooks/use-yjs-setup.ts`
- `packages/editor/src/core/hooks/use-collaborative-editor.ts`
- `packages/editor/src/core/hooks/use-presence.ts` (create)
- `packages/editor/src/core/helpers/presence.ts` (create)
- `packages/editor/src/core/components/presence/` (create)
- `packages/editor/src/core/components/editors/document/collaborative-editor.tsx`
- `packages/editor/src/styles/` for remote caret/pointer styling
- `packages/editor/src/index.ts` and the nearest component/hook barrel files
- `packages/editor/package.json`
- `apps/live/src/types/index.ts`
- `apps/live/src/lib/auth.ts`
- `apps/live/src/extensions/database.ts`
- `apps/live/tests/` for presence authorization/database regression tests
- `apps/web/core/hooks/use-page-realtime.ts` (create)
- `apps/web/core/components/pages/editor/editor-body.tsx`
- `apps/web/core/components/pages/editor/page-root.tsx`
- `apps/web/core/components/pages/sheet/sheet-editor.tsx`
- `apps/web/core/components/pages/sheet/sheet-presence.ts` and tests (create)
- `pnpm-workspace.yaml` and `pnpm-lock.yaml` only if the cursor extension is added
- `plans/README.md` status row only

**Out of scope**:

- Replacing `description_json.sheet_snapshot` with Yjs or another CRDT.
- Changing the Sheet `commit`, undo/redo, debounce, REST payload, Atlas sheet
  tools, or sheet gallery preview serializer.
- Whiteboard, PDF, task-list spreadsheet layout, mobile, public read-only pages,
  guest presence, comments, notifications, or persistent activity history.
- A global "who is online in the workspace" system. Presence is page-scoped and
  ephemeral only.
- Database migrations, new REST endpoints, analytics, or storing mouse
  coordinates server-side.
- Trusting client-supplied avatar URLs. Resolve avatar/name from the workspace
  member store by the awareness user ID whenever possible.

## Git workflow

- Stay on `main` in the existing working tree.
- Preserve all pre-existing user changes. In particular, this plan was written
  while unrelated Sticky/editor changes and modifications to
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `plans/README.md` were already
  present. Never overwrite or revert them.
- Before any commit, run `git status --short --branch` and confirm `## main`.
- Do not commit or push unless the operator explicitly asks. Pushing `main`
  deploys the web and API/live services.
- If asked to commit, use the repo's concise imperative style, for example:
  `feat: add live editor presence`.

## Presence contract and UX

Use one versioned payload stored under the awareness state's `presence` field,
validated at runtime before rendering. The separate top-level `user` field
remains owned by the Tiptap collaboration-cursor extension:

```ts
type TEditorPresencePayload = {
  v: 1;
  user: { id: string };
  pointer?: {
    x: number; // normalized 0..1 within the registered surface
    y: number; // normalized 0..1 within the registered surface
    surface: "document" | "sheet";
    updatedAt: number;
  };
  sheet?: {
    sheetId: string;
    selection?: { r1: number; c1: number; r2: number; c2: number };
  };
};
```

- Broadcast no cookie, email, avatar URL, raw document position, cell value, or
  other content.
- Resolve `user.id` to name/avatar with a callback backed by `useMember()`.
  Unknown/deleted members get a deterministic initials fallback and are never
  allowed to inject markup or image URLs.
- Keep one awareness entry per connection, but deduplicate the avatar group by
  user ID so multiple tabs do not produce duplicate faces. Pointer rendering may
  use the most recently updated connection for that user.
- Include the current user in the avatar group, order local first then remote by
  display name, show at most four faces, and use the existing `AvatarGroup` count
  overflow. Tooltips say `You` for local and the resolved name for remote users.
- Give every avatar a 2 px ring in that collaborator's deterministic color. The
  avatar ring, mouse pointer, pointer label, document caret/selection, and Sheet
  range must all use the same color so identity is readable without hovering.
  Maintain sufficient ring contrast in light and dark themes with a thin
  surface-colored separator between overlapping avatars.
- Throttle pointer broadcasts to at most 20 updates/second and at most one update
  per animation frame. Clear the pointer on `pointerleave`, window blur,
  `visibilitychange` to hidden, disconnect, and unmount.
- Ignore malformed coordinates, wrong payload versions, the local awareness
  client ID, and pointer updates older than 10 seconds. A stale pointer must
  disappear without removing the user's active avatar.
- Render pointer overlays with `pointer-events: none`, a deterministic user color,
  a high but bounded z-index below dialogs/popovers, and a compact name label.
  Respect `prefers-reduced-motion`: position updates remain immediate and any
  fade-in/out uses opacity only.
- Docs/Briefs also show remote Tiptap carets and text selections using the same
  color/name. Sheets show a remote colored outline and label for the remote cell
  range only when both users are on the same sheet tab.
- Presence failure must never block loading, editing, saving, or offline fallback.
  Hide the remote UI when disconnected; keep the existing sync status behavior.

## Steps

### Step 1: Extract and test the page realtime configuration

Create `apps/web/core/hooks/use-page-realtime.ts` and move the live-base URL,
collaboration path, query-parameter construction, and current-user configuration
out of `PageEditorBody`. The hook should accept `webhookConnectionParams` and
return:

- the normal document `TRealtimeConfig`;
- a function/config for a namespaced presence-only session that adds
  `connectionMode=presence` and `pageId=<UUID>` to the URL and uses
  `presence:<pageId>` as the Hocuspocus document name;
- the local `{ id, name, color }` user config;
- a member resolver using `getUserDetails(id)` that returns trusted display name
  and avatar URL (normalize the latter through the repo's existing file URL
  helper).

Call the hook once in `PageRoot`. Pass its document config/local user/member
resolver into `PageEditorBody`, and pass its presence-only config/local
user/member resolver into `SheetEditor`. Remove the corresponding URL/user
construction from `PageEditorBody` with no behavior change before wiring
presence. Docs, Briefs, and Sheets must not construct connection URLs in three
different places.

**Verify**:
`pnpm --filter=web check:types` → exit 0 and existing Docs still connect using
the same `/live/collaboration` URL and query parameters.

### Step 2: Add a safe presence-only mode to the live server

Extend `HocusPocusServerContext` with a discriminated connection mode and an
explicit `pageId`. Parse `connectionMode=presence` and `pageId` in
`apps/live/src/lib/auth.ts`.

For presence mode, authenticate the user as today **and** authorize the exact
page by calling the existing project page service's `fetchDetails(pageId)` with
the authenticated cookie. Require all of the following before accepting the
socket:

- non-empty workspace slug, project ID, page ID, and authenticated user ID;
- the API detail request succeeds for this user;
- returned page ID matches the requested page ID;
- returned `page_type` is `sheet` for V1.

Do not rely on the untrusted `presence:<pageId>` document name for permission
checks. Reject missing/mismatched/inaccessible pages with the normal
authentication failure path and do not reveal whether the page exists.

In `apps/live/src/extensions/database.ts`, branch on the validated context mode:

- presence fetch returns an empty `Uint8Array` without fetching/converting the
  page description;
- presence store is a no-op and never calls rich-text format conversion or the
  update-description API;
- normal document fetch/store behavior stays byte-for-byte equivalent.

Add Vitest coverage for authorized presence, missing page ID, inaccessible page,
wrong page type, presence fetch no-op, presence store no-op, and unchanged
document fetch/store delegation. Mock API calls; tests must not require network,
Postgres, or Redis.

**Verify**:
`pnpm --filter=live test && pnpm --filter=live check:types` → all tests pass and
typecheck exits 0.

### Step 3: Implement the reusable awareness state layer

Add pure presence helpers and `usePresence` in `@plane/editor`. The hook should
take a `HocuspocusProvider`, local user ID, surface kind, member resolver, and
registered container element/ref. It must:

1. write only `setLocalStateField("presence", payload)` while preserving the
   top-level `user` field owned by the Tiptap collaboration cursor extension;
2. subscribe to awareness `change`/`update` and cleanly unsubscribe;
3. validate and normalize remote states;
4. deduplicate avatars by user ID and select the freshest pointer per user;
5. track pointer movement against `getBoundingClientRect()` using normalized
   coordinates so different viewport sizes still render reasonably;
6. expose an action for Sheets to update/clear `{ sheetId, selection }` without
   replacing the user/pointer fields;
7. clear local ephemeral state on all lifecycle events in the Presence contract.

Extend `CollaborationProvider`/`useYjsSetup` with a mode that defaults to
`document`. Presence mode must reuse the tested socket/auth/reconnect cleanup but
skip IndexedDB persistence and document-ready gating. Do not fork a second copy
of the provider lifecycle.

Create reusable `CollaboratorAvatarGroup` and `RemotePointerOverlay` components
under `packages/editor/src/core/components/presence/`. Export the public types,
hook/provider entry point, and components through `@plane/editor`.

Add deterministic tests for schema validation, coordinate clamping, stale
pointer filtering, duplicate-user resolution, and selection normalization. If
the editor package still has no test runner, keep pure rendering-independent
tests in `apps/web/core/components/pages/sheet/sheet-presence.test.ts` against
exported pure helpers; do not add a second, redundant Vitest setup solely for
this feature.

**Verify**:
`pnpm --filter=@plane/editor check:types && pnpm --filter=@plane/editor build && pnpm --filter=web test:unit`
→ all commands exit 0.

### Step 4: Wire document avatars, pointers, carets, and selections once for Docs and Briefs

Inside the existing `CollaborationProvider`, register the collaborative editor
wrapper as the document presence surface and render the shared avatar/pointer
components. Keep the avatar group sticky at the upper-right of the editor
viewport so it stays visible during document scrolling without covering the
title, menus, navigation pane, or Atlas drawer. Briefs automatically receive
this behavior because they use the same `PageRoot`/`PageEditorBody` path; do not
add a Brief-specific socket.

Add the Tiptap 2 collaboration cursor extension at the same pinned version as
the other Tiptap dependencies. Configure it with the existing provider and local
user details, render escaped text labels, and add theme-safe caret/selection CSS.
Install it for the body editor and title editor only once each. Preserve the
existing `Collaboration` fields (`default` and `title`) and do not recreate the
editors on every awareness update; all extension configuration inputs must be
memoized.

If the exact `@tiptap/extension-collaboration-cursor@2.22.3` API is incompatible
with the current Hocuspocus provider, stop and report rather than upgrading all
Tiptap packages or hand-rolling Yjs relative-position mapping.

**Verify**:
`pnpm --filter=@plane/editor build && pnpm --filter=web check:types` → both exit 0. In React DevTools/manual logging, awareness pointer updates must not recreate
either Tiptap editor instance.

### Step 5: Wire Sheet avatars, pointers, and remote ranges over the presence-only channel

Wrap only the Sheet surface in a provider configured with the namespaced
presence-only session from Step 1. Do not mount IndexedDB document persistence or
wait for Yjs document sync in this mode; the sheet must render from
`description_json` exactly as before even if live presence is unavailable.

In `SheetEditor`:

- place `CollaboratorAvatarGroup` at the right side of the title row;
- register `rootRef` for normalized mouse movement and render the pointer overlay
  over the full sheet surface;
- publish the active sheet ID and normalized selection whenever `activeId` or
  `selection` changes;
- clear the selection field when there is no focus/range or when switching tabs;
- render remote selection borders inside cells using the existing
  `rectBorder`/selection rendering pattern, but with the remote collaborator's
  deterministic color and a compact name label at the range anchor;
- render remote ranges only for the currently active sheet tab and cap rendered
  remote ranges to a reasonable number (10) to avoid turning every cell into an
  unbounded awareness loop;
- do not make awareness state observable through MobX or call `commit()` from
  presence updates.

Extract payload/range transformation into `sheet-presence.ts` and test same-tab,
different-tab, invalid range, stale pointer, and multiple-collaborator cases.

**Verify**:
`pnpm --filter=web test:unit && pnpm --filter=web check:types` → all tests pass
and typecheck exits 0.

### Step 6: Verify lifecycle, access control, and cross-instance behavior

Run a two-browser/manual smoke using two different authorized workspace members
and, if practical, a second live-server process sharing Redis:

1. Open the same Doc: both avatars appear; mouse pointers move; remote text caret
   and selection appear; typing still converges.
2. Open the same project Brief: the same behavior appears with one socket per
   user and without reintroducing the hidden Brief title.
3. Open the same Sheet and same tab: avatars, pointers, and cell ranges appear.
   Switch one user to another tab: their cell range disappears for the other
   user while their avatar remains.
4. Leave the surface, hide the tab, disconnect the network, and close a browser:
   pointers disappear promptly, avatars disappear after awareness disconnect,
   and reconnect restores them without duplicates.
5. Resize windows and scroll independently: normalized pointers remain within
   the registered surface and never intercept clicks.
6. Lock a page or use a user without page access: the presence connection is
   rejected and no identities leak, while the page's existing access UI remains
   unchanged.
7. Edit a Sheet while the live server is down: JSON saving, undo/redo, formulas,
   charts, and title updates work exactly as before.
8. Inspect the Sheet page after presence use: `description_binary` remains
   untouched and `description_json.sheet_snapshot` retains its normal shape.

Record the smoke result in the plan status when marking it DONE. If a full
multi-instance environment is unavailable, mark that one check explicitly
pending rather than claiming it passed.

**Verify**:
`pnpm check` → exit 0. Then run `git diff --check` → no whitespace errors.

## Test plan

- `apps/live/tests/lib/auth-presence.test.ts` (or nearest matching test path):
  authorized sheet; missing identifiers; unauthorized detail fetch; wrong page
  type; generic auth error response.
- `apps/live/tests/extensions/database-presence.test.ts`: presence fetch/store do
  not call document conversion or update services; normal document mode still
  delegates.
- Pure presence tests: valid/invalid payload versions, clamped coordinates,
  stale pointers, local-client filtering, duplicate users, and cleanup helpers.
- `apps/web/core/components/pages/sheet/sheet-presence.test.ts`: active-tab range
  projection, hidden other-tab ranges, invalid/capped ranges, and deterministic
  collaborator color/identity resolution.
- Manual two-user checks are mandatory because one-process unit tests cannot
  prove browser lifecycle, pointer placement, Tiptap decoration behavior, or
  Redis cross-instance fan-out.

## Done criteria

- [ ] One Doc/Brief Hocuspocus provider carries content plus awareness; no second
      socket is created for document surfaces.
- [ ] Sheets use a namespaced, authorized, presence-only Hocuspocus document and
      never enter rich-text load/store conversion.
- [ ] Active editors appear as trusted-resolver avatars in Docs, Briefs, and
      Sheets; duplicate tabs do not duplicate avatar faces.
- [ ] Each collaborator has one deterministic color shared by their avatar ring,
      mouse pointer/label, Doc caret/selection, and Sheet range in both themes.
- [ ] Remote pointers are throttled, labeled, non-interactive, cleared on
      lifecycle changes, and hidden after staleness.
- [ ] Docs/Briefs show remote Tiptap carets/selections without editor recreation.
- [ ] Sheets show remote ranges only on the matching active tab and do not route
      presence updates through MobX or sheet persistence.
- [ ] Awareness payloads contain no cookie, email, avatar URL, cell value, or
      document content.
- [ ] Existing Sheet REST persistence, Atlas tools, previews, undo/redo, and data
      schema remain unchanged.
- [ ] Unauthorized presence connection tests pass and do not disclose page
      existence.
- [ ] Editor build/types, live tests/types, web tests/types, focused lint,
      `pnpm check`, and `git diff --check` all pass.
- [ ] Two-browser Doc, Brief, Sheet, disconnect/reconnect, and live-server-down
      smoke results are recorded.
- [ ] `git status --short --branch` shows `main` and no files outside the approved
      scope were changed by this work.
- [ ] Plan 029 status in `plans/README.md` is updated.

## STOP conditions

Stop and report instead of improvising if:

- The live server cannot authorize a presence-only Sheet without a new API
  endpoint or without revealing page existence.
- Hocuspocus 2.15.2 cannot isolate a namespaced awareness-only document from the
  database/title-sync extensions without changing normal document behavior.
- The pinned Tiptap 2.22.3 collaboration cursor extension is incompatible with
  the current provider; do not upgrade the editor stack in this plan.
- Implementing Sheet ranges requires changing `description_json`, `commit()`,
  Atlas sheet tools, or the API preview serializer.
- Presence causes Tiptap editors to recreate on pointer updates, Sheet saves to
  fire from remote awareness, or more than one socket per Doc/Brief user.
- Any in-scope dependency/lockfile section overlaps unresolved user changes that
  cannot be preserved cleanly.
- A verification command fails twice after one reasonable correction.
- The implementation needs files outside Scope; report the exact file/reason and
  request a plan amendment.

## Maintenance notes

- The awareness payload is versioned. Additive fields must remain optional;
  breaking changes require accepting the previous version during a rolling
  deploy because old and new web clients will overlap.
- Keep awareness ephemeral. Never persist it to Postgres/Redis history or use it
  as an audit trail.
- Sheet awareness is not sheet content collaboration. A future CRDT plan must
  reconcile the web model with API gallery previews and Atlas mutations that
  currently read/write `description_json.sheet_snapshot`.
- Reviewers should scrutinize effect cleanup, reconnect duplication, untrusted
  awareness parsing, authorization before awareness join, and whether any
  high-frequency state escaped into MobX or caused editor recreation.
- If whiteboard presence is added later, reuse the same presence-only connection
  and payload version with a new surface-specific optional field; do not create a
  third presence stack.
