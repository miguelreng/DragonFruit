# Plan 019: Convert Markdown files and folders into a Wiki collection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 841bb4897b..HEAD -- apps/web/core/components/docs apps/web/core/services/page apps/web/core/store/pages packages/types/src/page apps/api/plane/app/views/page apps/api/plane/app/serializers/page.py apps/api/plane/db/models/page.py apps/api/plane/tests/contract/app/test_page_app.py`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `841bb4897b`, 2026-07-12

## Why this matters

DragonFruit already has a polished Docs gallery, page folders, and a one-file
Markdown importer. The next high-leverage product move is to let a user take a
pile of local docs - many Markdown files, or a folder of Markdown files - and
turn it into a navigable Wiki collection in one flow. This fits the core product
promise: raw knowledge becomes organized work, with the user approving the
structure before DragonFruit creates anything.

V1 should be deliberately narrow: Markdown only, project-scoped Docs only, one
top-level folder collection, no Atlas rewriting. Once this works, Atlas can add
the higher-magic pass: propose groups, cross-links, summaries, stale/conflicting
claim warnings, and missing-page suggestions.

## Current state

- `docs/ux/build-reader.py` is a local prototype of the desired output: a group
  of Markdown docs becomes a single navigable reader with doc navigation and
  per-page table of contents.
- `apps/web/core/components/docs/use-create-markdown-doc.ts` currently imports
  one Markdown file at a time and creates one `page_type: "doc"` page.
- `apps/web/core/components/docs/workspace-create-doc-button.tsx` exposes a
  single file input for PDF or Markdown upload inside a project-scoped Docs tab.
- `apps/web/core/components/docs/workspace-docs-root.tsx` already supports
  folders (`page_type: "folder"`), drag/drop, bulk file drop, active folders,
  and the header action area where a new "Import wiki" action belongs.
- `apps/api/plane/tests/contract/app/test_page_app.py` already covers folder
  lifecycle and verifies that folder pages are included alongside `page_type=doc`
  workspace list responses.

Important excerpts to confirm after the drift check:

```ts
// apps/web/core/components/docs/use-create-markdown-doc.ts:16
const MAX_MARKDOWN_SIZE_BYTES = 2 * 1024 * 1024;

// apps/web/core/components/docs/use-create-markdown-doc.ts:21
// html:false (the default) escapes any raw HTML embedded in the markdown, so
// the produced description_html is safe to seed straight into the editor.
const markdownRenderer = new MarkdownIt({ linkify: true });

// apps/web/core/components/docs/use-create-markdown-doc.ts:83
const page = await pageService.create(workspaceSlug, projectId, {
  access: EPageAccess.PUBLIC,
  page_type: "doc",
  name,
  description_html: html,
  ...(parentPageId ? { parent: parentPageId } : {}),
});
```

```tsx
// apps/web/core/components/docs/workspace-docs-root.tsx:719
const canDropPdf = !!scopeProjectId && activePageTypes.includes("pdf");
const canDropMarkdown = !!scopeProjectId && activePageTypes.includes("doc");
const canDropFiles = canDropPdf || canDropMarkdown;

// apps/web/core/components/docs/workspace-docs-root.tsx:757
// Sequential so we don't fire N presign/upload chains at once.
const created = await importable.reduce<Promise<number>>(async (createdCountPromise, file) => {
  const createdCount = await createdCountPromise;
  const page = isMarkdownFile(file)
    ? await createMarkdownDocPage(scopeProjectId, file, activeFolder?.id)
    : await createPdfPage(scopeProjectId, file, activeFolder?.id);
  return page ? createdCount + 1 : createdCount;
}, Promise.resolve(0));
```

```tsx
// apps/web/core/components/docs/workspace-docs-root.tsx:914
<WorkspaceCreateDocButton
  workspaceSlug={workspaceSlug}
  defaultType={pageType}
  lockedProjectId={scopeProjectId}
  parentFolderId={scopeProjectId ? activeFolder?.id : undefined}
/>
```

```python
# apps/api/plane/tests/contract/app/test_page_app.py:148
class TestPageFolderAPI:
    """Folders = pages with page_type "folder"; docs join one via `parent`."""

# apps/api/plane/tests/contract/app/test_page_app.py:178
# The workspace docs list returns folders alongside a doc-typed filter.
workspace_response = session_client.get(f"/api/workspaces/{workspace.slug}/pages/?page_type=doc")
```

Repo conventions that apply:

- Work directly on `main`; do not create a branch or worktree in this repo.
- Use `workspace:*` for internal packages and existing UI primitives from
  `@plane/ui`, `@plane/propel`, and local shims.
- Icons should come from the existing Solar/lucide-shim exports used in Docs.
- Keep page creation through `ProjectPageService.create`; do not add a backend
  import endpoint for V1.
- The web app has no general frontend unit-test runner. Use typecheck/lint plus
  manual runtime smoke for the UI, and only add/adjust API contract tests if the
  backend shape changes.

## Commands you will need

| Purpose                                     | Command                                                                        | Expected on success                             |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| Web typecheck                               | `pnpm turbo run check:types --filter=web`                                      | exit 0, no TypeScript errors                    |
| Web lint                                    | `pnpm turbo run check:lint --filter=web`                                       | exit 0, no new lint errors                      |
| Full check                                  | `pnpm check`                                                                   | exit 0                                          |
| API page contracts, only if backend touched | `cd apps/api && python -m pytest plane/tests/contract/app/test_page_app.py -q` | exit 0                                          |
| Dev server smoke                            | `pnpm dev`                                                                     | web available on port 3000; stop it after smoke |

## Scope

**In scope**:

- `apps/web/core/components/docs/use-create-markdown-doc.ts`
- `apps/web/core/components/docs/workspace-create-doc-button.tsx`
- `apps/web/core/components/docs/workspace-docs-root.tsx`
- New files under `apps/web/core/components/docs/import/`
- `apps/web/core/components/docs/index.ts` only if an export is needed
- `apps/api/plane/tests/contract/app/test_page_app.py` only if backend behavior
  is changed or a backend regression test is needed

**Out of scope**:

- No backend bulk-import endpoint in V1.
- No PDF, `.docx`, Google Drive, Notion, or ZIP parsing in this plan.
- No Atlas information-architecture or summary generation in this plan.
- No nested-folder Docs navigation in this plan. Current Docs UI treats folders
  as a one-level collection surface; preserve that until nested navigation is
  explicitly designed.
- No changes to the existing Wikipedia `/wiki`, `@wiki`, `/cite`, glossary, or
  citation-check features. This plan is about local docs becoming an internal
  DragonFruit Wiki collection.
- No large dependency additions. `markdown-it` is already a `web` dependency.

## Git workflow

- Work directly on `main` per `AGENTS.md`.
- Do not create task branches or worktrees.
- Do not commit or push unless the user explicitly asks.
- Before any commit request, run `git status --short --branch` and make sure
  only files related to this plan are staged.

## Product decisions for V1

1. The user can import many `.md` / `.markdown` files or choose a folder.
2. The import runs only in a project-scoped Docs tab where `scopeProjectId` is
   known. Workspace-wide Docs cannot import because page folders are project
   scoped.
3. The import creates one top-level folder page named after the selected folder
   or a user-editable collection title.
4. Each Markdown file becomes one regular doc page inside that folder.
5. Nested source paths are preserved as metadata and visible in preview, but V1
   does not create nested folders. If two files would have the same page title,
   suffix them with their relative path segment or a numeric suffix.
6. The user sees a preview before any pages are created: file count, skipped
   files, oversized files, duplicate-title resolutions, and the destination
   project/folder.
7. Import is sequential and recoverable: if item N fails, keep created pages,
   show the partial success count, and list failed files. Do not attempt a
   destructive rollback in V1.

## Steps

### Step 1: Extract Markdown conversion into reusable import helpers

Create `apps/web/core/components/docs/import/markdown-doc.ts` and move the pure
parts of `use-create-markdown-doc.ts` into it:

- `MAX_MARKDOWN_SIZE_BYTES`
- `isMarkdownFile(file: File)`
- `getMarkdownTitleAndBody(fileName: string, text: string)` - current H1 title
  promotion logic
- `renderMarkdownToHtml(markdown: string)` - using `new MarkdownIt({ linkify: true })`
- `getImportErrorMessage(err, fallback)` - current error extraction helper

Keep `html:false` as the default MarkdownIt behavior; do not enable raw HTML.

Then update `use-create-markdown-doc.ts` to import the helper functions and keep
the public hook API unchanged:

```ts
export const useCreateMarkdownDocPage = (workspaceSlug: string) => {
  // same return shape: { createMarkdownDocPage, isConverting }
};
```

**Verify**:

`pnpm turbo run check:types --filter=web` -> exit 0.

### Step 2: Add a Wiki import planner

Create `apps/web/core/components/docs/import/wiki-import-planner.ts`.

Implement a pure planner that accepts `File[]` and returns a preview structure
without creating pages:

```ts
export type TWikiImportDraft = {
  collectionName: string;
  files: TWikiImportFileDraft[];
  skipped: TWikiImportSkippedFile[];
  warnings: string[];
};

export type TWikiImportFileDraft = {
  file: File;
  relativePath: string;
  pageName: string;
  descriptionHtml: string;
};
```

Planner rules:

- Include only Markdown files using `isMarkdownFile`.
- Reject files over `MAX_MARKDOWN_SIZE_BYTES` into `skipped`.
- Use `file.webkitRelativePath || file.name` for relative paths. Access
  `webkitRelativePath` with a typed helper because it is browser-specific:

```ts
const getRelativePath = (file: File) =>
  (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
```

- Derive `collectionName` from the first path segment when available; otherwise
  default to `"Imported wiki"`.
- Use the first H1 as the page name; otherwise use the filename without extension.
- Sort files by relative path for predictable creation order.
- Resolve duplicate page names deterministically. Prefer `"Title (folder-name)"`
  when the relative parent folder is available; otherwise `"Title 2"`,
  `"Title 3"`, etc.
- Return warnings for nested folders: "Nested source folders are flattened in
  this version; paths are preserved in the preview."

Do not create React state in this file. Keep it pure so it can later be moved
or tested when the web test harness exists.

**Verify**:

`pnpm turbo run check:types --filter=web` -> exit 0.

### Step 3: Build the preview modal

Create `apps/web/core/components/docs/import/wiki-import-modal.tsx`.

Use the existing modal pattern from
`apps/web/core/components/docs/doc-template-gallery-modal.tsx`:

- `ModalCore` from `@plane/ui`
- `EModalPosition.TOP`
- `EModalWidth.XXXL` or `EModalWidth.XXXXL`
- Close button with `X` from `@/components/icons/lucide-shim`
- Buttons from `@plane/propel/button`
- Toasts from `@plane/propel/toast`

Props:

```ts
type Props = {
  workspaceSlug: string;
  projectId: string;
  isOpen: boolean;
  files: File[];
  parentFolderId?: string;
  onClose: () => void;
  onImported: () => Promise<void> | void;
};
```

Behavior:

- On open, run the planner for `files`.
- Show editable collection name, number of pages to import, skipped files, and
  warnings.
- Show a scrollable preview list: page title, relative path, and a small
  "Markdown" label.
- Confirm button label: `Create wiki`.
- Cancel is disabled while importing.
- On confirm:
  1. Create a folder page with `page_type: "folder"`, `access: EPageAccess.PRIVATE`,
     and the collection name. If `parentFolderId` is set, STOP and report before
     nesting folders; V1 should not create a folder inside a folder unless the
     current Docs UI supports displaying nested folders.
  2. Sequentially create each doc page inside that folder with:

```ts
{
  access: EPageAccess.PUBLIC,
  page_type: "doc",
  name: draft.pageName,
  description_html: draft.descriptionHtml,
  parent: collectionFolder.id,
  view_props: {
    import_wiki: {
      source_path: draft.relativePath,
    },
  },
}
```

Preserve existing `view_props` defaults by sending only this key at create
time; do not mutate existing pages. 3. Toast success: `"Wiki created"` with `"N docs imported."` 4. If some files fail after the folder is created, toast warning:
`"Wiki partially created"` with created/failed counts; keep created pages. 5. Call `onImported()` and close only after the creation loop finishes.

Do not navigate automatically to the first imported page in V1. The collection
folder appearing in the Docs surface is the success state; opening can be the
user's next action.

**Verify**:

`pnpm turbo run check:types --filter=web` -> exit 0.

### Step 4: Add "Import wiki" controls to the project-scoped Docs surface

In `apps/web/core/components/docs/workspace-docs-root.tsx`:

- Add state for selected import files:

```ts
const [wikiImportFiles, setWikiImportFiles] = useState<File[] | null>(null);
const folderImportInputRef = useRef<HTMLInputElement>(null);
const filesImportInputRef = useRef<HTMLInputElement>(null);
```

- Show an `Import wiki` secondary button only when:
  - `scopeProjectId` exists
  - `activePageTypes.includes("doc")`
  - `!activeFolder` (V1 imports collections at the current project Docs root)

- Use a small menu or two sibling actions:
  - `Choose files` -> `<input type="file" multiple accept=".md,.markdown,text/markdown" />`
  - `Choose folder` -> `<input type="file" multiple webkitdirectory="" />`

React's TypeScript DOM types may not know `webkitdirectory`. Use a narrow local
type or `// @ts-expect-error - browser directory picker attribute` on that one
attribute. Prefer a local type if it is clean.

- On input change, set `wikiImportFiles` to `Array.from(event.target.files ?? [])`
  and reset the input value so the same folder can be chosen again.
- Mount `WikiImportModal` near the existing `FolderNameModal` / delete modal
  block, passing `workspaceSlug`, `scopeProjectId`, `files`, and `mutatePages`.
- Keep existing drag/drop behavior unchanged. Do not make folder drag/drop auto
  create a wiki; explicit preview is required.

If adding another button makes the header cramped on narrow widths, put the
two import choices behind one menu button rather than adding three separate
large buttons.

**Verify**:

`pnpm turbo run check:types --filter=web` -> exit 0.

### Step 5: Keep the one-file Markdown upload path working

In `apps/web/core/components/docs/workspace-create-doc-button.tsx`, keep the
existing `Upload file` behavior for one Markdown/PDF file. It should continue
to call `createMarkdownDocPage(projectId, file, parentFolderId)` for a single
file and navigate to the created page.

Do not route single-file upload through the new Wiki modal; importing one file
as one doc and importing many files as a Wiki are separate user intentions.

**Verify**:

`pnpm turbo run check:types --filter=web` -> exit 0.

### Step 6: Optional backend guardrails only if needed

The existing backend already supports:

- `page_type: "folder"`
- `parent` on docs
- workspace list including folders alongside `?page_type=doc`

Do not touch backend code unless the V1 flow exposes a real gap. If backend
changes are needed, add or extend contract tests in
`apps/api/plane/tests/contract/app/test_page_app.py`.

Useful existing test pattern:

```python
@pytest.mark.contract
class TestPageFolderAPI:
    @pytest.mark.django_db
    @patch("plane.app.views.page.base.page_transaction.delay")
    def test_folder_lifecycle(...):
        ...
```

**Verify, only if backend touched**:

`cd apps/api && python -m pytest plane/tests/contract/app/test_page_app.py -q`
-> exit 0.

### Step 7: Runtime smoke

Start the app:

`pnpm dev`

Smoke in the web app on port 3000:

1. Open a project-scoped Docs tab.
2. Click `Import wiki`.
3. Choose the folder `docs/ux` from this repo.
4. Confirm the preview shows Markdown files and skips `build-reader.py` and
   `index.html`.
5. Click `Create wiki`.
6. Confirm one new folder appears in Docs.
7. Open the folder and confirm each imported Markdown file appears as a doc.
8. Open one imported doc and confirm the first H1 became the page title and is
   not duplicated at the top of the body.
9. Repeat with two individual Markdown files selected via `Choose files`.
10. Confirm single-file `Upload file` still creates and navigates to one doc.

Stop the dev server after smoke.

**Verify**:

Manual smoke passes. Record any browsers where folder picker is unavailable;
the file picker fallback must still work.

## Test plan

- Frontend automated tests: none in V1, because `web` currently has no general
  unit-test runner. Keep the import planner pure and isolated so it can be
  covered when a web test harness is introduced.
- Backend tests: add or update `apps/api/plane/tests/contract/app/test_page_app.py`
  only if backend behavior changes. If untouched, rely on existing
  `TestPageFolderAPI::test_folder_lifecycle`.
- Static verification:
  - `pnpm turbo run check:types --filter=web`
  - `pnpm turbo run check:lint --filter=web`
  - `pnpm check`
- Runtime verification: complete the smoke checklist in Step 7.

## Done criteria

All must hold:

- [ ] Project-scoped Docs has an explicit `Import wiki` flow.
- [ ] The user can select multiple Markdown files.
- [ ] The user can select a folder in browsers that support directory picking.
- [ ] The preview lists imported Markdown files, skipped non-Markdown files,
      skipped oversized files, duplicate-title resolutions, and nested-folder
      flattening warnings.
- [ ] Confirming creates one folder page and one doc page per importable
      Markdown file under that folder.
- [ ] Existing one-file Markdown/PDF upload still works unchanged.
- [ ] No Wikipedia-related command, mention, or helper code is modified.
- [ ] `pnpm turbo run check:types --filter=web` exits 0.
- [ ] `pnpm turbo run check:lint --filter=web` exits 0.
- [ ] `pnpm check` exits 0, or any failure is documented as pre-existing with
      exact failing command output.
- [ ] Runtime smoke checklist completed.
- [ ] `plans/README.md` status for 019 updated.

## STOP conditions

Stop and report back if:

- Current files do not match the excerpts above after the drift check.
- The desired V1 requires nested folder navigation. Current Docs folder UI is
  one-level; do not silently add nested folders that users cannot navigate.
- The browser folder picker cannot be typed without broad DOM type hacks. Keep
  the folder picker optional and preserve multi-file import.
- Importing a Markdown file requires enabling raw HTML in `markdown-it`.
- Any step requires adding a new large parsing dependency.
- The work appears to require changing the backend page model or serializer
  beyond optional guardrail tests.
- Typecheck or lint fails twice after reasonable fixes.

## Maintenance notes

- The name "Wiki" in this plan means an internal DragonFruit docs collection,
  not the existing Wikipedia integration. Keep code names clear enough that
  future maintainers do not confuse the two.
- If nested folder navigation ships later, revisit the planner and make nested
  source directories create nested folder pages instead of flattening.
- If Atlas organization ships later, put it after the deterministic preview:
  Atlas should propose structure/cross-links, and the user should approve before
  page creation.
- When a web test runner is added, first cover `markdown-doc.ts` and
  `wiki-import-planner.ts`; those helpers are intentionally pure to make that
  easy.
