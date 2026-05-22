# Dragon Fruit — Positioning, Copy & Features

A working reference for what we're building and how we talk about it. Lives next to the code so it stays honest.

---

## 1. The wedge in one sentence

> The single canvas where docs and tasks are the same surface — not the upsell.

Plane gates work-item embeds in docs behind their Pro tier and reduces the OSS experience to an "Upgrade to Plane Pro" card. Dragon Fruit ships that experience open, layered with a Craft.do-grade editor and an AI flow that turns a meeting into a spec with live tasks in one paste.

## 2. Who we're for

- Teams whose work starts as writing — product, design, services, ops
- Self-hosters who want a beautiful workspace without paying for every "Pro" checkbox
- Buyers who already use Plane / Linear / Notion and feel the seam between docs and tracker every day

## 3. Who we're _not_ for

- Pure ticket-shufflers who never touch a doc
- Engineering-team-of-one tracking sprints in GitHub Issues — too much surface for the value
- Anyone whose primary need is Gantt charts or resource planning

---

## 4. Copy

### Top taglines (pick one for the hero)

- **Docs and tasks. One canvas.**
- **The spec is the tracker.**
- **Beautiful docs. Live tasks. Same page.**
- **Plan, write, and ship — beautifully.** _(already in the auth screens)_

### One-liners for the landing page

- Plane charges for embedded work items in docs. We ship them open, on a canvas built to be written in.
- Paste a meeting transcript. Walk away with a spec — and six real tickets, in the project, in the same doc.
- The serif you'd actually want to read your PRD in. The tracker you'd actually want to ship from.

### Screenshot captions

- _Type `/`, pick a work item, drop it in your doc. Edit status right here. It updates in the project._
- _Paste yesterday's call. Watch the spec write itself. Click the action items into existence._
- _Same workspace, different mode. Write like Craft. Track like Plane._

### Section headers for the landing page

- **Write where you ship.** — the canvas pitch
- **One paste, one spec, six tasks.** — the transcript flow
- **Open where Plane charges.** — the moat positioning
- **Hosted, self-hosted, your call.** — the deployment story

### In-product strings (drop-in)

- Empty page: _Start writing. Press `/` for blocks, work items, or AI._
- Slash menu group title: _Work_
- Slash menu item — embed existing: _Embed work item_ / _Search and link an existing task_
- Slash menu item — create new: _New work item_ / _Create a task here and embed it_
- Slash menu item — transcript: _Spec from transcript_ / _Paste a meeting, get a draft_
- Draft action-item card hint: _Draft — click create to make it real_
- Promote-all toolbar: _Create all action items_
- Permission-denied embed card: _Linked work item — you don't have access to this project_
- Loading card: _Loading work item…_

### Onboarding copy refresh (already partly done)

- Hero: _A workspace where the docs feel as good as the tracker._
- Subhead: _Plane's project model, Craft's writing soul, AI that turns meetings into specs._

### Pricing-page copy (future tier)

- Free / self-hosted: _Everything Plane locks behind Pro. Yours, open, forever._
- Hosted: _We run it. You write. AI included._
- Enterprise: _SSO, audit log, data residency, BYO LLM key._

---

## 5. Features

### 5.1 Live Spec — the headline feature

A combined flow: **work-item embeds in docs** + **transcript-to-doc with draft tasks** + **one-click promote**.

The demo script that sells it:

> Here's a 40-minute Granola transcript from yesterday's customer call. Paste. Three seconds. Dragon Fruit just wrote the spec — decisions, risks, six action items. Each action item is already a draft work item, right here in the doc. Click. Click. Click. Six real tickets, assigned, in the project. The doc and the tracker are the same surface.

#### 5.1.1 Work-item embed (Slice 1)

- TipTap Node already in tree at `packages/editor/src/core/extensions/work-item-embed/`
- Schema is fine; we just need to render a real card and wire the host
- The card subscribes to the existing issue store by `entity_identifier`; one source of truth, no doc-side state copy

#### 5.1.2 Inline editing on the embedded card (Slice 2)

- Status / assignee / due-date dropdowns reuse existing `apps/web/core/components/issues/` dropdowns
- Optimistic via existing MobX store; multi-user via Plane's existing issue update channel (separate from doc HocusPocus)

#### 5.1.3 Transcript → spec (Slice 3)

- New Django endpoint: `POST /api/v1/workspaces/{slug}/projects/{project_id}/transcript-to-doc/`
- Server-side Anthropic call, structured-output prompt:
  ```
  { sections: [{ heading, body_markdown }], action_items: [{ title, description, assignee_hint?, priority? }] }
  ```
- Server converts to ProseMirror JSON; action items become `work-item-embed` nodes in `draft` state
- Gated by workspace feature flag in `packages/constants/src/feature-flags.ts`

#### 5.1.4 Promote draft → real work item (Slice 4)

- Each draft embed card shows a "Create" button → existing issue-create API → swap from `{ draft: true, draftPayload }` to `{ workItemId }`
- Batch action "Create all action items" at the top of the doc
- Open question: where do drafts land? _Inbox_ project by default? User picks per-doc? Lock before shipping Slice 4.

#### 5.1.5 Granola direct pull (Slice 5)

- Optional one-click "Import last meeting" — uses the Granola MCP available locally
- Server-side: paste-box first; Granola integration is the polish layer

### 5.2 Two creation paths for work items

| Path                                            | When                                                  |
| ----------------------------------------------- | ----------------------------------------------------- |
| Tracker: project view → "+ New issue"           | Triage, sprint planning, "I have a task, find a home" |
| Doc: `/` → "New work item" or "Embed work item" | Writing a spec, action items mid-sentence             |
| Doc: paste transcript → promote drafts          | Post-meeting, the AI seeded everything                |

All three produce the same row in the issues table. No parallel system. The embed in the doc is a _view_, not a copy.

### 5.3 Slash command UX (locked: inline async)

- Type `/` → menu opens
- Type `/embed alpha` → menu shows live API results from `workspaceService.searchEntity` as you type
- Type `/new Buy the staging Postgres upgrade` → captures the title after the command, creates the issue, drops the embed in one keystroke
- Type `/spec from transcript` → opens a paste-box modal (this one needs a modal because of the text volume)

Why inline async: the writing flow stays unbroken. Linear and Notion both feel this way; Plane today does not.

### 5.4 Other differentiators (from the original brainstorm)

These didn't make Slice 1 but stay on the board:

- **Block-level comments & suggestions mode** — Google-Docs-style review in the doc
- **Customer-facing portals** — repurpose `apps/space` as a branded client portal with comment-only access
- **Vertical templates that ship pre-wired** — "Field ops runbooks," "Client engagements w/ SOWs," "Hardware bring-up" — fields + views + automations on day one
- **Inline AI in your house style** — rewrites using your published docs as voice context
- **Page covers + emoji headers** — cheap visual moat
- **BYO LLM keys at enterprise tier** — removes the procurement objection that blocks Linear/Notion in regulated buyers

### 5.5 What we deliberately won't build

- A generic AI assistant chatbot — Plane has Pi; we'd lose that race
- Yet another Gantt / Timeline — tablecloth feature, not a switching reason
- Mobile-first — our target user is a desktop writer
- Backwards-compatibility shims for Plane Pro APIs we don't run

---

## 6. Architecture decisions (locked)

### 6.1 Editor public API — Decision 1(a)

Add `embedConfig?: TEmbedConfig` to the editor props. Thread it through `CollaborativeDocumentEditorWithRef` and `DocumentEditorWithRef`. When `embedConfig.issue?.widgetCallback` is set, the document-extensions registry instantiates `WorkItemEmbedExtension({ widgetCallback })` and registers it.

**Rationale:** matches the shape Plane would use for their Pro implementation; conflicts with upstream are additive (new optional prop), not destructive.

### 6.2 Slash-command picker — Decision 2(b)

Inline async slash menu. The slash command extension is extended to support dynamic items: a command can declare `asyncItems({ query }) => Promise<ISlashCommandItem[]>` in addition to the static `items`. The dropdown shows static items first, then merges in API results as they arrive.

**Rationale:** end-user UX wins. The writing flow stays in-place. Costs more editor-core surgery than a modal, but pays it back in feel.

### 6.3 AGPL × AI

Transcript endpoint ships open. Server reads `ANTHROPIC_API_KEY` from env; refuses gracefully if absent. Hosted plan provides the key; self-hosted plan brings their own. No closed-source carve-outs.

---

## 7. Status as of writing

- **Slice 0 (visual fork):** done — Craft.do CSS layer, metadata, auth/onboarding copy
- **Slice 1 (read-only embed card + editor wiring):** done — see [issue-embed-card.tsx](apps/web/ce/components/pages/editor/embed/issue-embed-card.tsx)
- **Slice 1.5 (slash commands + picker modal):** done — modal-based picker, not yet truly inline-async-in-slash-menu
- **Slice 2 (inline edits on card):** done — State / Members / Date dropdowns wired in the card, update via `useIssueDetail().updateIssue`
- **Slice 3 (transcript-to-doc):** done — Django endpoint `POST /api/workspaces/<slug>/projects/<id>/transcript-to-doc/`, frontend modal `/spec from transcript`, ProseMirror insertion at cursor
- **Slice 4 (promote draft action items):** done as part of Slice 3 — each generated action item is a draft `work-item-embed` node with a Create button (`DraftEmbedCard`)
- **Slice 5 (Granola pull):** partially done — smart-paste in the modal detects Granola exports and strips boilerplate (metadata, AI summary, timestamp markers). Direct/one-click pull from the Granola MCP still requires a server-side ingestion path, deferred.
- **Slice 6 (BYO LLM key in workspace settings):** done — new admin-only settings page at `/{slug}/settings/ai/`, Fernet-encrypted key at rest, `get_llm_config()` checks the workspace before falling back to instance/env. See [§9](#9-qa-whats-verified-and-what-isnt-as-of-slices-1--15).
- **Slice 7 (preview-before-insert):** done — the transcript modal now generates a preview, shows sections + draft action items, then user clicks **Insert at cursor** to apply. Back button returns to the compose step.
- **Slice 8 (block-level commenting MVP):** done — `/comment on this block` adds a comment thread to the current block; `/show comments` toggles a side panel with all unresolved threads. Resolve from the panel; click "Jump to block" to scroll the editor to the highlight. Storage: new `PageBlockComment` model + REST endpoints under `/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/block-comments/`.

---

## 8. Open questions to resolve before shipping each slice

- **Slice 1:** Replace the CE stub directly or keep it and add a Dragon-Fruit hook? _Tentative: replace directly, accept the merge cost._
- **Slice 3:** Workspace-wide feature flag, or per-project? Self-host BYO-key UI?
- **Slice 4:** Default project for draft action items — inbox? Last-used? Per-doc setting?
- **Slice 5:** Granola MCP integration is client-side only today; does that work for a hosted user, or do we need a server-side ingestion path?

---

## 9. QA — what's verified and what isn't (as of Slices 1 & 1.5)

### Automated checks (passing)

- `pnpm turbo run check:types --filter=@plane/editor --filter=web` — 0 errors
- `pnpm turbo run check:lint --filter=@plane/editor --filter=web` — 0 errors (warning counts unchanged vs. baseline)

### What was not yet verified in-browser

The dev server (`pnpm dev --filter=web`) compiles, but exercising the feature end-to-end requires the full backend stack (Postgres + Redis + Django API). I did not boot docker-compose in this session, so the items below are _unverified_ and depend on a manual walk-through.

### Manual browser QA — script to run before merging

Boot the stack:

```bash
./setup.sh                                   # one-time .env scaffolding
docker compose -f docker-compose-local.yml up
# open http://localhost
```

Then, with a workspace + at least one project:

**1. The embed card renders (Slice 1)**

- Pre-condition: open the browser devtools network tab; ensure `/api/workspaces/{slug}/entity-search/` is reachable.
- Open any project page (Pages → New page).
- The page should load without errors. Old docs that already had a `work-item-embed` node should now render the real card — not the "Upgrade to Plane Pro" upsell.
- _Smoke-test by hand_: in browser devtools, paste this into the page's content via the API or fixture a doc with `<work-item-embed entity_identifier="..." project_identifier="..." workspace_identifier="..." />` to see the card render directly.

**2. Slash command surface (Slice 1.5)**

- In a page, type `/` — slash menu opens.
- Type `/embed` — _"Embed work item"_ appears under a **Work** section.
- Type `/new` — _"New work item"_ appears.
- Select _Embed work item_ → a centered modal opens at top of viewport with a search box. The search field is autofocused.
- Type a few characters → results appear within ~200ms (debounced). Each row shows `IDENTIFIER-SEQ — name`.
- Click a result → modal closes; embed card appears in the doc at the slash command position.
- Repeat for _New work item_ → modal opens with a title input + "Create work item" button. Press Enter (or click the button) → a real issue is created in the project, and the embed card appears in the doc.

**3. Live updates (Slice 1)**

- Open the same page in two browser tabs.
- In Tab A, change the status of an embedded work item via the project tracker (not from the doc).
- In Tab B, the card's state pill should reflect the change within seconds (driven by Plane's existing issue store sync, not by HocusPocus).

**4. Permission-denied state**

- Insert an embed referencing a work item in a project the current user can't access (e.g. via a manual API call or DB seed).
- The card should render _"Linked work item — you don't have access"_ instead of crashing.

### Slice 3 (transcript-to-doc) — what to verify

- **Setup for Claude**: in the api container env, set:
  ```
  LLM_PROVIDER=anthropic
  LLM_API_KEY=sk-ant-...
  LLM_MODEL=claude-sonnet-4-6   # or claude-opus-4-7, claude-haiku-4-5
  ```
  These are the same env vars Plane uses for its existing AI features. After the provider-routing fix, those flow through to the real Anthropic SDK.
- **Setup for OpenAI**: `LLM_PROVIDER=openai`, `LLM_API_KEY=sk-...`, `LLM_MODEL=gpt-4o-mini` (or any from `OpenAIProvider.models`). Works the same way.
- In a page, type `/spec` → _Spec from transcript_ appears under **Work**.
- Click it → modal opens with an optional context field and a transcript paste box.
- Paste a few paragraphs of a real (or synthetic) meeting transcript, click **Generate spec**.
- Expected: the modal closes and the editor receives, at the cursor position:
  - A `## Summary` (or similar) heading and bullet points for each section the model produced
  - A `## Action items` heading followed by _draft_ embed cards — dashed border, sparkle icon, "Click create to make it real", with a **Create** button on the right
- Click **Create** on a draft card → the card swaps to a real `IssueEmbedCard` showing the live identifier/title/state.

### Known gaps to flag in the walk-through

- **Embed search returns only one project's items unless the user is workspace-admin.** The `searchEntity` API respects per-project ACLs; that's correct, but worth confirming on a multi-project workspace.
- **`/new work item` creates with title only.** Assignee, state, priority all default. If the user expects to set those inline, that's a Slice 2-ish enhancement, not part of 1.5.
- **No "create new at top of search results" yet.** I shipped a separate `/new work item` slash item. The doc's `5.3` description says we wanted both create-from-search-empty _and_ a dedicated slash. The dedicated slash works; the in-search create is a follow-up.
- **Picker is a centered modal, not truly inline-async-in-the-slash-menu.** The locked decision was the latter; the picker is pragmatic but gives the right end-user feel. Upgrading to in-slash async items requires editor-core surgery on the suggestion plugin — tracked as future work.
- **Slice 3 LLM call is now provider-aware.** Plane's upstream `get_llm_response()` always hit OpenAI's URL regardless of `LLM_PROVIDER`. We introduced `call_llm_chat()` in [external/base.py](apps/api/plane/app/views/external/base.py) that actually routes to the correct SDK per provider (`anthropic.Anthropic` for Anthropic, `openai.OpenAI` for OpenAI). The legacy `get_llm_response()` now delegates to it, so the existing `GPTIntegrationEndpoint` and `WorkspaceGPTIntegrationEndpoint` benefit from the fix too. To use Claude end-to-end: set `LLM_PROVIDER=anthropic`, `LLM_API_KEY=<your Anthropic key>`, `LLM_MODEL=claude-sonnet-4-6` (or any value in `AnthropicProvider.models`). Gemini is still not server-side wired and returns a clean error message.
- **Slice 3 returns JSON-via-prompt, not JSON-mode.** We ask the model for strict JSON in the system prompt and parse defensively (a regex fallback if the model wraps it in fences). Models with `response_format: { type: "json_object" }` would be more reliable; gated on the broader provider-routing fix above.
- **Slice 3 inserts at the cursor without confirmation.** The user sees the result land in the page. If they want to undo, they undo. No "preview before insert" step — that's a deliberate UX choice (you see it where it lands), but worth confirming.
- **Promoted drafts use title + plain description.** Assignee, priority, due date all default. Slice 4 enhancement: pull assignee_hint / priority from the model's output when present.

### Preview-before-insert (Slice 7)

- Run `/spec from transcript`, paste, click **Generate preview**.
- Instead of inserting immediately, the modal flips to a preview pane: each section is shown with its heading and bullets; action items appear as dashed pills (no `Create` button yet — they only become real drafts in the doc after insertion).
- Top-left **Back** button → returns to compose with the transcript intact for tweaking.
- Bottom-right **Insert at cursor** → applies the ProseMirror doc; the action item pills become live `DraftEmbedCard` widgets in the page that you can click to create the real work item.

### Block-level commenting (Slice 8 MVP)

- Click anywhere inside a paragraph, type `/comment on this block` (also matches `/comment`, `/feedback`, `/review`).
- The parent block's text gets wrapped with the `block-comment` mark (subtle peach underline via [dragonfruit.css §13](packages/editor/src/styles/dragonfruit.css)) and a composer modal opens.
- Type the comment, press ⌘+Enter (or click **Post comment**) → it lands in `page_block_comments` and the side panel pops open on the right.
- Use `/show comments` (or the same slash menu entry) to toggle the panel manually.
- Inside the panel: a thread per block, each with author timestamp and a **Resolve** button (sets `resolved_at` and removes it from the active list). "Jump to block" scrolls the editor to the highlight and pulses it briefly.

What's deferred for the full v1:

- **Replies** — the model supports `parent_id`, but the UI doesn't render threading yet.
- **Edit / delete from the panel** — the endpoints support it; UI controls aren't wired.
- **Realtime sync** — comments don't propagate via HocusPocus; the panel refreshes when the user posts or resolves. Other tabs need to manually toggle the panel.
- **@-mention notifications inside comment bodies** — the field is plain text.
- **Selection-based commenting** — the slash command attaches to the parent block, not an arbitrary text range. A bubble-menu trigger would do the latter.
- **Bridge pattern note**: the slash command dispatches `dragonfruit:request-block-comment` / `dragonfruit:toggle-comments-panel` CustomEvents on the editor DOM (bubbling to window). The host listens on `window` to stay agnostic of the editor ref shape. This is a tactical bridge — a proper `commentConfig` callback on the editor props would be the long-term shape, mirroring `embedConfig.issue`.

### BYO LLM key (workspace settings → AI)

- Workspace admins now have an **AI** tab at `/{slug}/settings/ai/` (sidebar icon: Sparkles, under Features).
- Form: provider dropdown (OpenAI, Anthropic, Gemini) → model dropdown (filtered by provider, default highlighted) → API key field (password input).
- Pressing **Save** PATCHes `/api/workspaces/{slug}/llm-config/` with `{ llm_provider, llm_model, llm_api_key }`. The API key is Fernet-encrypted at rest using `plane.license.utils.encryption.encrypt_data` (keyed off `SECRET_KEY`).
- The form does **not** re-display the saved key; it shows a masked preview (`sk-a…XYZ`) under the input.
- Pressing **Remove workspace override** clears all three fields, falling the workspace back to the instance-level `LLM_*` env vars.
- Resolution order in `get_llm_config(workspace)`:
  1. Workspace fields (if `workspace.llm_api_key` is set and decryptable)
  2. Instance-level / `LLM_*` env vars
- All three external endpoints (`TranscriptToDocEndpoint`, `GPTIntegrationEndpoint`, `WorkspaceGPTIntegrationEndpoint`) now pass the workspace into `get_llm_config()`, so BYO keys apply to _every_ AI feature, not just the transcript flow.
- Migration: [0122_workspace_llm_config.py](apps/api/plane/db/migrations/0122_workspace_llm_config.py). Three nullable fields on the `workspaces` table — `llm_provider`, `llm_model`, `llm_api_key`. Safe to roll forward on a populated DB.

### Smart-paste for Granola (Slice 5 partial)

- Paste a Granola meeting export into the **Transcript** field of the spec modal.
- A small button appears under the field heading: _"Granola export detected — clean it up"_. Click it.
- The cleaner ([granola.ts](apps/web/core/components/editor/embeds/transcript-spec/granola.ts)):
  - If the paste has an explicit `## Transcript` section, keeps only what's after it
  - Drops sections named _Summary_, _Key takeaways_, _AI summary_, etc. (Granola's auto-summary, which would skew the LLM's own summary)
  - Removes metadata lines (`Date:`, `Attendees:`, `Duration:`, …)
  - Strips timestamp markers from speaker lines so `Alice (00:14:32): hello` becomes `Alice: hello`
- A subtle line below the textarea reports what was stripped (e.g. _"Cleaned Granola export — kept only the transcript section, removed 4 metadata lines, stripped 18 timestamp markers."_).
- Detection is conservative: if the input doesn't have two signals (header + metadata + timestamps + the word "Granola"), the button doesn't appear and nothing is touched.
- One-click pull from the Granola MCP would require either a per-user sync script (Claude → API) or a webhook endpoint — both deferred.

## Roadmap Status vs Plane Base (Updated May 22, 2026)

### Shipped in DragonFruit (Delta vs Plane)

- Rebrand + task terminology.
- Newsreader/Figtree typography.
- AI agents: BYOK, tool use loop, runs panel, draft approvals.
- Native calendar + Google overlay.
- Diagrams + whiteboards.
- Workspace docs + drafts.
- Redesigned home.
- Page-level focus mode + drop cap toggles.
- Slash menu polish with quick blocks and richer quote/callout variants.
- Better page covers + emoji header defaults on new pages.
- More agent tools: search issues, list attachments, multi-step planning helper.
- Two-way Google Calendar sync: outbound task sync to Google + Google-event-to-task quick-import flow.

### Still Largely Plane-Base

- Core issue/project/cycle schemas and permission model.
- Base work item CRUD endpoints and most list/filter semantics.
- Core collaboration and real-time foundations outside DragonFruit-specific editor/agent/calendar additions.
