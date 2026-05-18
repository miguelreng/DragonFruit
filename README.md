# DragonFruit

> Beautiful, customizable project management & docs — built on Plane, with a Craft.do-inspired writing experience.

DragonFruit is an opinionated fork of [Plane](https://github.com/makeplane/plane) (AGPL-3.0). It keeps Plane's solid project-management foundation (workspaces, projects, work items, cycles, modules, views, pages) and rebuilds the parts that matter most to us: **the editor and the visual design**.

The goal is a single workspace where the docs feel as good as the project tracker — something we'd actually want to write in.

---

## Why fork Plane

Plane already has the hard parts done:

- A mature TipTap/ProseMirror-based editor (`packages/editor`)
- Real-time collaborative editing (`apps/live`)
- A Django REST backend (`apps/api`)
- A full PM domain model (issues, cycles, modules, views, pages)
- Self-hostable, AGPL-licensed, actively developed

We didn't want to rebuild any of that. We wanted to **change how it looks and feels** — particularly the docs experience.

## What's different (so far)

| Area              | Change                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor typography | New `packages/editor/src/styles/dragonfruit.css` layer — serif display headings, humanist sans body, relaxed 1.7 line-height, ~680px measure, soft peach selection color, refined task lists, optional focus mode and drop cap |
| Editor surface    | Every `<EditorContainer>` now carries a `.dragonfruit` class so the new look applies everywhere automatically                                                                                                                  |
| Site metadata     | `SITE_NAME`, `SITE_DESCRIPTION`, OG tags, PWA app name                                                                                                                                                                         |
| Auth screens      | "Plan, write, and ship beautifully." / "Welcome back to DragonFruit."                                                                                                                                                          |
| Onboarding        | New welcome copy framing docs + projects as one workspace                                                                                                                                                                      |
| Constants         | `packages/constants/src/metadata.ts`                                                                                                                                                                                           |

The underlying Plane code remains intact, so upstream fixes can be merged in cleanly. See [Staying in sync with Plane](#staying-in-sync-with-plane).

---

## Stack

| Layer    | Tech                                                           |
| -------- | -------------------------------------------------------------- |
| Frontend | React Router 7 (the `apps/web` app), TipTap, Zustand, Tailwind |
| Backend  | Django + DRF (Python)                                          |
| Realtime | Node service (`apps/live`) using HocusPocus                    |
| Storage  | Postgres, Redis, S3-compatible object store                    |
| Tooling  | pnpm workspaces, Turborepo, oxlint, oxfmt, husky               |

Node ≥ 22.18, pnpm 10.32, Python 3.12+.

## Running locally

The fastest path is Docker Compose (Plane's existing setup works unchanged):

```bash
# 1. One-time env setup
./setup.sh

# 2. Bring everything up
docker compose -f docker-compose-local.yml up
```

Then visit `http://localhost`.

For frontend-only iteration (e.g. tweaking the Craft.do styles):

```bash
pnpm install
pnpm dev --filter=web
```

You'll need the API + Redis + Postgres running separately (Compose them up without `web`).

## Repo layout

```
apps/
  web/        — main React Router app (the editor lives here, served via @plane/editor)
  api/        — Django backend
  live/       — real-time collaboration server
  space/      — public publishing app
  admin/      — instance admin UI
  proxy/      — nginx reverse proxy

packages/
  editor/     — TipTap editor + DragonFruit visual layer (styles/dragonfruit.css)
  ui/         — shared UI components
  constants/  — branding strings, feature flags
  types/      — shared TypeScript types
  i18n/       — translations
  ...
```

## Where the DragonFruit changes live

If you want to see exactly what we changed (vs. Plane), look at:

- `packages/editor/src/styles/dragonfruit.css` — the typography & rhythm overlay
- `packages/editor/src/styles/index.css` — imports the overlay
- `packages/editor/src/core/components/editors/editor-container.tsx` — adds the `dragonfruit` class
- `packages/constants/src/metadata.ts` — site name, descriptions
- `apps/web/app/root.tsx`, `apps/web/app/layout.tsx` — page titles, meta tags
- `apps/web/core/components/account/auth-forms/auth-header.tsx` — login copy
- `apps/web/core/components/instance/not-ready-view.tsx` — first-run welcome
- `apps/web/ce/components/onboarding/tour/root.tsx` — onboarding tour copy

Logos, favicons, and OG images still inherit Plane's assets — swapping those is the next visible win.

## Staying in sync with Plane

When this repo was created we set up Plane as a second remote so we can pull bugfixes without re-forking:

```bash
git fetch upstream-plane
git merge upstream-plane/preview   # or main, depending on the branch you want
```

Conflicts will surface in the files listed in [Where the DragonFruit changes live](#where-the-dragonfruit-changes-live). The Craft.do CSS layer is purely additive, so it should never conflict.

## Roadmap

Near-term (visual polish):

- [ ] Replace logos, favicons, and OG image
- [ ] Bundle Newsreader / Inter Display web fonts so the serif headings work without system fallbacks
- [ ] Page-level toggle for focus mode and drop cap (currently CSS-only)
- [ ] Sidebar refresh — quieter dividers, softer accent

Mid-term (functionality):

- [ ] Slash-menu polish to match Craft's quick-block UX
- [ ] Quote-block variants (callout, note, warning) with Craft-like cards
- [ ] Page covers and emoji headers with refined defaults
- [ ] First-class "docs home" view, distinct from projects

## License

AGPL-3.0, inherited from Plane. See [`LICENSE.txt`](./LICENSE.txt). All original Plane code remains © Plane Software, Inc. DragonFruit modifications are AGPL-3.0 as well.

## Credits

- [Plane](https://plane.so) — the foundation this is built on
- [Craft.do](https://craft.do) — the docs experience we're chasing
- TipTap, ProseMirror, Newsreader, Inter — the tools that make beautiful text on the web possible
