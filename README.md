<p align="center">
  <a href="https://app.dragonfruit.sh">
    <img src="branding/logo.svg" alt="DragonFruit" height="80" />
  </a>
</p>

<p align="center">
  <strong>Beautiful, customizable project management &amp; docs — built on Plane, with a Craft.do-inspired writing experience.</strong>
</p>

<p align="center">
  <a href="https://app.dragonfruit.sh">app.dragonfruit.sh</a>
  &nbsp;·&nbsp;
  <a href="https://twitter.com/miguelreng">@miguelreng</a>
  &nbsp;·&nbsp;
  <a href="./LICENSE.txt">AGPL-3.0</a>
</p>

---

DragonFruit is an open-source project built by [Rengi (@miguelreng)](https://twitter.com/miguelreng) — an opinionated fork of [Plane](https://github.com/makeplane/plane) (AGPL-3.0). It keeps Plane's solid project-management foundation (workspaces, projects, work items, cycles, modules, views, pages) and rebuilds the parts that matter most to us: **the editor and the visual design**.

The goal is a single workspace where the docs feel as good as the project tracker — something we'd actually want to write in.

Try the hosted version at **[app.dragonfruit.sh](https://app.dragonfruit.sh)**, or self-host with the instructions below.

---

## Why fork Plane

Plane already has the hard parts done:

- A mature TipTap/ProseMirror-based editor (`packages/editor`)
- Real-time collaborative editing (`apps/live`)
- A Django REST backend (`apps/api`)
- A full PM domain model (issues, cycles, modules, views, pages)
- Self-hostable, AGPL-licensed, actively developed

We didn't want to rebuild any of that. We wanted to **change how it looks and feels** — particularly the docs experience.

## What's different from Plane

### 🤖 AI agents as workspace members

DragonFruit ships **first-class AI agents** that live alongside human members.

- **BYOK, vendor-agnostic** — routed through a LiteLLM-style provider abstraction. Bring your own OpenAI / Anthropic / Gemini / local key. No platform-owned keys.
- **Encrypted at rest** — `llm_api_key` is stored encrypted; ciphertext never leaves the API boundary.
- **@-mention to trigger** — mention an agent in an issue description or comment and it dispatches.
- **`/agent` slash command** — invoke an agent inline from the editor; workspace-level webhook fan-out.
- **Tool-use loop** — agents can `change_state`, `add_label`, post comments, edit page blocks, and operate in draft mode.
- **Runs panel** — telemetry, per-run cancel, stop button to kill in-flight work, expandable run history with token cost capture.

### 📅 Native task calendar + Google overlay

- DragonFruit's own calendar view (not Plane's) — white cells, square corners, click-day to create a task, custom toolbar (no Material UI residuals).
- Optional **Google Calendar** read-only overlay so personal events sit next to project deadlines.

### 📝 New page types

- **Docs** at the workspace level (not just per-project), surfaced in the sidebar.
- **Diagrams** — Mermaid pages with a unified diagram-editor.
- **Whiteboards** — Excalidraw pages.
- **Drafts** — locally-unsynced edits surfaced as their own section with a Renaissance-style empty state.

### 🏠 Reimagined home

- Drag-and-drop home sections: **On my plate**, **Inbox**, **Favorites**, plus an **Agent cost** widget.
- A `home-hero-header` layout that frames the workspace instead of dumping you into a project list.

### 🎨 Editor & visual design

- **Typography overlay** (`packages/editor/src/styles/dragonfruit.css`) — serif display headings (Newsreader), humanist sans body (Figtree), 1.7 line-height, ~680px measure, soft peach selection, refined task lists, optional focus mode and drop cap. Self-hosted fonts, no external font CDN.
- **Phosphor icons** replacing Lucide across the app, regular weight by default.
- **Renaissance empty states** — vector illustrations instead of generic painted JPGs.
- **DragonFruit wordmark + topbar redesign** — workspace switcher lives in the sidebar; ⌘K hint on the topbar search.
- **Rebrand pass** — "Work item" → "Task" throughout the UI; new favicons, logos, OG assets, PWA manifest.

### 🧭 Sidebar IA cleanup

- Removed workspace-views, customize-navigation, and the legacy workspace-menu split.
- Agents pinned alongside Docs / Diagrams / Whiteboards.
- Consolidated through a single `workspace-menu-root` + `sidebar-navigation`.

### 🔌 Underneath

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

DragonFruit runs in two halves: the Docker stack (api, worker, postgres, redis, minio, rabbitmq) and the four frontend dev servers (`web`, `admin`, `space`, `live`).

```bash
# 1. One-time env setup
./setup.sh

# 2. Bring the backend stack up (detached)
docker compose -f docker-compose-local.yml up -d

# 3. Install deps and start the four frontends in one terminal
pnpm install
./dev.sh
```

Then open:

| App   | URL                   | What it is                         |
| ----- | --------------------- | ---------------------------------- |
| web   | http://127.0.0.1:3000 | the product (workspaces, projects) |
| admin | http://127.0.0.1:3001 | instance settings (SMTP, OAuth)    |
| space | http://127.0.0.1:3002 | public published pages             |
| live  | http://127.0.0.1:3100 | HocusPocus realtime collab         |

`dev.sh` also supports a few modes:

```bash
./dev.sh web              # just one
./dev.sh web live         # a subset
./dev.sh --tmux           # one tmux session, one window per app
./dev.sh --tabs           # 4 macOS Terminal tabs
```

Stop everything:

```bash
# frontends: Ctrl-C in the dev.sh terminal (or `tmux kill-session -t dragonfruit`)
docker compose -f docker-compose-local.yml down
```

## Repo layout

```
apps/
  web/        — main React Router app (editor, agents, calendar, home)
  api/        — Django backend (workspaces, projects, agents, LLM provider)
  live/       — real-time collaboration server (HocusPocus)
  space/      — public publishing app
  admin/      — instance admin UI
  proxy/      — nginx reverse proxy

packages/
  editor/     — TipTap editor + DragonFruit visual layer (styles/dragonfruit.css)
  propel/     — icon system (Phosphor, hugeicons shim, DragonFruit brand marks)
  ui/         — shared UI components and primitives
  constants/  — branding strings, feature flags, metadata
  types/      — shared TypeScript types
  i18n/       — translations
  ...
```

## Where the DragonFruit changes live

If you want to see exactly what's different (vs. Plane), the main areas are:

- **Agents** — `apps/web/core/components/agents/`, `apps/api/plane/app/views/agents/`, workspace-level `LLMProvider` abstraction
- **Calendar** — `apps/web/core/components/calendar/` (replaces Plane's Schedule-X calendar)
- **Diagrams & Whiteboards** — `apps/web/core/components/pages/diagram/` and `apps/web/core/components/pages/whiteboard/`
- **Home** — `apps/web/core/components/home/sections/` (favorites, inbox, on-my-plate, agent-cost)
- **Drafts** — `apps/web/core/components/drafts/` + `renaissance-draft-illustration.tsx`
- **Editor typography** — `packages/editor/src/styles/dragonfruit.css`
- **Branding** — `branding/`, `apps/*/public/favicon/`, `packages/propel/src/icons/brand/`, `packages/constants/src/metadata.ts`
- **Sidebar IA** — `apps/web/core/components/workspace/sidebar/workspace-menu-root.tsx`, `sidebar-menu-items.tsx`

## Staying in sync with Plane

When this repo was created we set up Plane as a second remote so we can pull bugfixes without re-forking:

```bash
git fetch upstream-plane
git merge upstream-plane/preview   # or main, depending on the branch you want
```

Conflicts will surface in the files listed in [Where the DragonFruit changes live](#where-the-dragonfruit-changes-live). The CSS overlays are purely additive, so they should never conflict.

## Roadmap

Shipped:

- [x] Full rebrand — logos, favicons, OG, PWA, "Work item" → "Task"
- [x] Self-hosted Newsreader (serif) and Figtree (sans)
- [x] AI agents (BYOK, tool-use, @-mention, runs panel)
- [x] Agent automation center (browse/manage, rule builder, edit/duplicate/test-run)
- [x] Native task calendar + optional Google Calendar overlay
- [x] Diagrams (Mermaid) and Whiteboards (Excalidraw)
- [x] Workspace-level Docs and Drafts surfaces
- [x] Redesigned Home with drag-and-drop sections

Up next:

- [ ] Page-level toggle for focus mode and drop cap (currently CSS-only)
- [ ] Slash-menu polish to match Craft's quick-block UX
- [ ] Quote-block variants (callout, note, warning) with Craft-like cards
- [ ] Page covers and emoji headers with refined defaults
- [ ] More agent tools: file attachments, project search, multi-step planning
- [ ] Two-way Google Calendar sync (today it's read-only)

## License

AGPL-3.0, inherited from Plane. See [`LICENSE.txt`](./LICENSE.txt). All original Plane code remains © Plane Software, Inc. DragonFruit modifications are AGPL-3.0 as well.

## Credits

- [Plane](https://plane.so) — the foundation this is built on
- [Craft.do](https://craft.do) — the docs experience we're chasing
- TipTap, ProseMirror, Newsreader, Inter — the tools that make beautiful text on the web possible

---

Built by [Rengi](https://twitter.com/miguelreng) · [app.dragonfruit.sh](https://app.dragonfruit.sh)
