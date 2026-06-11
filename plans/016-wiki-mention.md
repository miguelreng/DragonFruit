# Plan 016: Real `@wiki` mention — Wikipedia entities in the @-mention dropdown + hover card

> **Executor instructions**: Cross-package feature (`@plane/types` → `@plane/editor` →
> `apps/web`), both packages consumed from **dist** — rebuild in that ORDER or web
> typecheck won't see your changes. No runtime harness — verify with typecheck +
> builds + lint; reviewer smoke-tests. If a STOP condition occurs, take the fallback
> or stop+report. SKIP updating plans/README.md. Audit claims against real tool
> output. Reply with the report format at the end.
>
> **Drift check (run first)**: `git diff --stat 7aedf5232b..HEAD -- packages/types/src/search.ts packages/editor/src/core/types/mention.ts apps/web/core`

## Status

- **Priority**: P2 · **Effort**: M–L (3 packages) · **Risk**: MED (prod UI, can't runtime-verify → reviewer smokes)
- **Depends on**: 015 A–C merged (the `wikipedia-client` + `searchWikipedia`/`fetchWikipediaSummary` are on main)
- **Category**: feature
- **Planned at**: commit `7aedf5232b`, 2026-06-10
- **Why this over the `/wiki-link` fallback**: maintainer wants the real mention UX (hover-able linked entity), not a 3rd slash command. This plan also REMOVES the interim `/wiki-link`.

## How the mention system works (confirmed)

- `packages/types/src/search.ts:15` — `TSearchEntities = "user_mention" | "issue" | "project" | "cycle" | "module" | "page"` (closed union; consumed from dist).
- `packages/editor/src/core/types/mention.ts` — `TMentionHandler = { renderComponent({entity_identifier, entity_name}), searchCallback(query) => Promise<TMentionSection[]>, getMentionedEntityDetails? }`. `TMentionSuggestion.entity_name: TSearchEntities`. The mention node-view delegates rendering to the host's `renderComponent`.
- `apps/web` provides a `mentionHandler` per editor (document/editor.tsx, rich-text, etc.) — find the shared builder/hook for `searchCallback` (it calls `workspace.service.ts` search by `query_type`) and `renderComponent`.

## Steps (build in dist order; commit per package)

### Step 1: `@plane/types` — add the `wiki` entity (commit 1)

- `packages/types/src/search.ts`: add `"wiki"` to `TSearchEntities`.
- Rebuild types dist: `pnpm turbo run build --filter=@plane/types` (or the repo's types build). **Verify**: `pnpm turbo run check:types --filter=@plane/types` exit 0.

### Step 2: `@plane/editor` — accept `wiki` mentions + hover (commit 2)

- With the type change, `entity_name: "wiki"` is now valid. Check `mention-node-view.tsx` / `mentions-list-dropdown.tsx` for any exhaustive switch on `entity_name` that needs a `wiki` case; the node-view should delegate to `renderComponent`, so prefer NOT hard-coding wiki rendering in the editor.
- If a hover/tooltip primitive exists in the editor, expose a way for `renderComponent` to drive it; otherwise the hover card lives in the web `renderComponent` (Step 3) — simplest. Keep editor changes minimal (ideally just the type flowing through).
- Rebuild editor dist: `pnpm turbo run build --filter=@plane/editor`. **Verify**: `check:types --filter=@plane/editor` exit 0.

### Step 3: `apps/web` — Wikipedia section in the dropdown + render + hover card (commit 3)

- **Suggestion source**: in the shared `searchCallback` builder, after the workspace-entity sections, append a **"Wikipedia" `TMentionSection`** when `query.length >= 3`: `searchWikipedia(query, {limit: 3})` → items `{ id, entity_identifier: <article url>, entity_name: "wiki", title: <article title>, subTitle: <description>, icon: <wiki icon> }`. Debounce/guard so it doesn't spam (the dropdown already debounces typing — reuse it). Keep it a separate section labeled "Wikipedia" so it never crowds out teammates/issues.
- **renderComponent**: add a `entity_name === "wiki"` branch → render the mention as a link to `entity_identifier` (the article URL), styled like other mentions, with a **hover card** that calls `fetchWikipediaSummary` (from `@plane/editor`'s `wikipedia-client`, or the web copy) and shows title + extract + thumbnail. Reuse the app's existing popover/tooltip component (grep for one used elsewhere) — do NOT hand-roll a popover framework.
- `searchWikipedia`/`fetchWikipediaSummary` live in `packages/editor/src/core/helpers/wikipedia-client.ts` — import from `@plane/editor` (rebuild already done in Step 2) or, if not exported, export them there.
- **Verify**: `check:types --filter=web` exit 0; `pnpm check:lint` no new errors.

### Step 4: remove the interim `/wiki-link` (commit 3, same as web or a small 4th)

- `packages/editor/src/ce/extensions/slash-commands.tsx`: remove the `/wiki-link` command (keep `/wiki` and `/cite`).
- `packages/editor/src/ce/types/editor-extended.ts`: remove `"wiki-link"` from `TExtendedEditorCommands`.
- Rebuild editor dist. **Verify**: editor + web typecheck, lint clean; `grep -rn "wiki-link" packages/editor apps/web` returns nothing.

## Scope

**In scope**: `packages/types/src/search.ts`; `packages/editor/src/core/{types/mention.ts, extensions/mentions/*, helpers/wikipedia-client.ts (export only if needed), ce/extensions/slash-commands.tsx, ce/types/editor-extended.ts}`; the shared web mention `searchCallback`/`renderComponent` builder + a wiki icon. Dist rebuilds for types + editor.
**Out of scope**: `/wiki` and `/cite` (keep), Phases A–C (merged), server/Python, multilingual, the LLM "most relevant article" refinement.

## Git workflow

- Branch: `advisor/016-wiki-mention`
- Commits per package (types, editor, web/cleanup). Do NOT push/PR.

## Done criteria

- `"wiki"` in `TSearchEntities`; types + editor dist rebuilt; `check:types` green for `@plane/types`, `@plane/editor`, and `web`; editor build success; `pnpm check:lint` no new errors
- Web `searchCallback` returns a "Wikipedia" section for queries ≥3 chars; `renderComponent` has a `wiki` branch with a hover card (reusing an existing popover primitive)
- `/wiki-link` fully removed (`grep -rn "wiki-link"` empty); `/wiki` + `/cite` still present
- Only in-scope files changed; `wikipedia-client` reused, not duplicated
- Report: where the shared mention builder lives, which popover primitive you reused, and the smoke steps

## STOP conditions

- The `searchCallback` builder is duplicated across many editors with no shared home, so adding the Wikipedia section cleanly would touch 8+ files — STOP and report the list; don't shotgun-edit. (Then we decide: a shared helper vs. scoping to the doc editor only.)
- No reusable hover/popover primitive exists in web — render the mention as a plain link with a `title` tooltip (no rich card) and report; don't build a popover framework.
- Adding `"wiki"` to `TSearchEntities` breaks an exhaustive `switch` somewhere that must handle every entity (e.g. a search dispatcher that maps `query_type` to an API) — handle the `wiki` case as a no-op/skip on the server-search side (Wikipedia isn't a workspace search) and report where.
- A dist rebuild of types/editor fails or the chain doesn't propagate — STOP and report (don't paper over with `any`).

## Maintenance notes

- Wikipedia is an _external_ mention source in an otherwise workspace-entity dropdown — keep it a clearly-labeled separate section so it never competes with teammates/issues.
- Future: LLM-pick the most relevant article; multilingual via locale; reuse the hover card for `/wiki` results too.
