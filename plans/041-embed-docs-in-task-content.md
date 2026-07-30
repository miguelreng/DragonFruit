# Plan 041: Attach and embed Docs in task descriptions and comments

> **Executor instructions**: Build one Page-reference node that works in both
> task editor variants. Reuse the existing editor embed architecture and
> workspace entity search; do not invent a second document format.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- packages/editor/src/ce packages/editor/src/core apps/web/core/components/editor apps/web/core/components/issues/issue-modal apps/web/core/components/comments`

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED–HIGH — shared editor schemas and persisted HTML are involved
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Implementation result

- **Status**: Implemented and release-checked on 2026-07-30.
- Rich task descriptions and Lite task comments share the same typed `page`
  embed node and workspace-wide Doc picker.
- Cards resolve the current Doc title and route; forbidden or deleted Docs
  render an unavailable state without exposing the saved title.
- The page node round-trips through editor JSON and HTML. Editor/Web type
  checks and production builds pass.

## Why this matters

Tasks often depend on project Docs, but users must currently paste a bare link
or rely on a mention. A compact, permission-aware Page card gives task context a
stable title, type, project, and open action while degrading safely if the Doc
is deleted or inaccessible.

## Current state

- Task descriptions use `RichTextEditor` in
  `issue-modal/components/description-editor.tsx:184-243`.
- Comments use `LiteTextEditor` in `comments/comment-create.tsx:140-182`.
- Full Docs support `DocEmbedExtension`, but
  `TDocEmbedType` currently includes only `whiteboard`, `sticky`, `task_view`,
  and `google_drive`.
- Only `DocumentEditorAdditionalExtensions` installs Doc embeds. Rich and Lite
  extension registries do not accept `embedConfig`.
- Both task editors already have workspace/project context and mention search.

## V1 behavior

- Toolbar/slash action **Attach Doc** opens a searchable workspace Doc picker.
- Task descriptions render a compact Page card; comments render the same node
  in a denser one-line form.
- Persist stable identifiers: workspace slug, project ID, page ID, page type,
  and a title snapshot. The live renderer may refresh the title.
- Open in a new/current app route as appropriate.
- Inaccessible/deleted Page renders “Document unavailable” without leaking
  title/content or breaking the editor.
- Copy/paste and read-only rendering round-trip the node.

## Scope

**In scope**:

- `packages/editor/src/ce/types/issue-embed.ts`
- `packages/editor/src/core/extensions/doc-embed/**`
- `packages/editor/src/ce/extensions/rich-text-extensions.tsx`
- The Lite editor extension registry identified during implementation
- `packages/editor/src/core/extensions/slash-commands/**`
- `apps/web/core/components/editor/rich-text/editor.tsx`
- `apps/web/core/components/editor/lite-text/editor.tsx`
- `apps/web/core/components/editor/embeds/page-reference/**` (create)
- Task description and comment call sites
- Focused editor serialization and Web picker/permission tests

**Out of scope**:

- Inline editing of the attached Doc from a task.
- Embedding full Doc contents in comments.
- Public/signed-out rendering.
- New Page permissions or cross-workspace references.
- Uploading a Doc as a file attachment.

## Steps

### Step 1: Extend the typed embed model

Add a `"page"` doc-embed type and config key. Remove the current type-specific
branch repetition in `renderDocEmbedWidget` by using one typed dispatch path if
that can be done without weakening types. Ensure unknown types retain the
existing unavailable fallback.

**Verify**: `pnpm --filter=@plane/editor check:types` exits 0.

### Step 2: Install Page embeds in Rich and Lite editors

Thread an optional `embedConfig` through Rich/Lite editor props and their
additional-extension registries. The extension must be enabled only when a
Page widget callback exists, preserving editor schemas for unrelated callers.

**Verify**: Editor and Web typechecks exit 0.

### Step 3: Add the searchable picker

Reuse workspace entity search with the Page entity type and current workspace.
Show title, type, and project; support keyboard selection, loading, no results,
and API error. Do not filter to the current project because cross-project Doc
mentions are already supported.

**Verify**: picker tests cover cross-project selection and error/no-result
states.

### Step 4: Build permission-aware renderers

Create shared Page-reference data loading and two visual densities. Never render
cached title/content after a 403/404 response; show the neutral unavailable
state. Prevent nested interactive elements inside editor links/cards.

**Verify**: tests cover available, renamed, deleted, forbidden, and read-only
states.

### Step 5: Wire task descriptions and comments

Add the action to both editors, keeping existing file attachment, mention,
Enter-to-submit, and asset upload behavior unchanged. Verify save/reload,
copy/paste, edit existing content, and comment submission.

**Verify**: Web/editor typechecks and focused tests pass.

## Test plan

- Editor: HTML/JSON parse-render round trip, copy/paste, unknown embed type.
- Web: picker keyboard flow, cross-project result, unavailable states.
- Runtime: description and comment create/edit/read-only; permissions from a
  user without target-project access.

## Done criteria

- [x] One typed Page node works in Rich and Lite editors.
- [x] Cross-project picker insertion works within the workspace.
- [x] Forbidden/deleted Pages leak no cached metadata.
- [x] Persistence, reload, and copy/paste round-trip.
- [x] Existing mentions and file attachments still work.
- [x] Editor/Web checks and focused tests pass.

## STOP conditions

- The persisted HTML sanitizer strips required known attributes.
- Enabling the extension changes schemas for callers without `embedConfig`.
- Permission-safe lookup cannot be reused from existing Page/search services.
- Comment payload limits cannot safely hold the compact node.
