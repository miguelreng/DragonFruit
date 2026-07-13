# DragonFruit — Landing Page UX Spec

> How the live landing (apps/landing, Astro, dragonfruit.sh) implements the brand story for the ICPs.
> Companions: [01-icp-profiles.md](01-icp-profiles.md) · [02-brand-story.md](02-brand-story.md). Source of copy truth: SOT §1.8.
> Reflects the page as shipped on 2026-07-11 (`apps/landing/src/pages/index.astro` + `styles/global.css`).

## Goal & conversion model

- **Primary conversion:** click **Start free** → app.dragonfruit.sh signup. Same label, same magenta, every instance.
- **Secondary:** See pricing (intent), View source / self-host (ICP 2 trust path — converts later, vouches now).
- **Page thesis:** one scroll = the SB7 arc. A visitor who only reads H1 + badge still gets the whole story.

## Design system (locked)

- **Type:** Sorts Mill Goudy 400 for hero H1 + section H2s (the "calm editorial" voice); Figtree for UI, cards, body. Hero H1 is a **single line**, viewport-tracked (`clamp(40px, 6.6vw, 84px)`), wrapping only ≤700px.
- **Color:** paper `#fffef9` / canvas `#f7f8f3` / ink `#171914` / muted `#667064` / accent magenta `#b30f78` (CTAs, "New", numbers) / green `#486c4a` (capability kickers). Hairline borders `rgba(23,25,20,.12)`, radius 8px.
- **Layout:** single 1240px column, hairline-ruled sections, centered narrative sections, ledger-style strips.

## Section map — the scroll IS the story

| #   | Section (id)                    | SB7 beat                        | Job                                                                | Primary ICP |
| --- | ------------------------------- | ------------------------------- | ------------------------------------------------------------------ | ----------- |
| 1   | Topbar                          | —                               | Orient + persistent CTA                                            | all         |
| 2   | Hero copy                       | Character + one-liner + CTA     | Say the transformation in 3s                                       | all         |
| 3   | Hero product window             | Guide proof (show, don't claim) | Make "teammate in the tracker" concrete                            | 1, 3        |
| 4   | Proof strip (`reference-proof`) | Character (who it's for)        | Self-identification                                                | all         |
| 5   | Problem (`problem-section`)     | Villain                         | Name the gap between idea and work                                 | all         |
| 6   | Atlas (`#product`, solution)    | Guide + Plan verbs              | Capture → Draft → Triage → Approve                                 | 1           |
| 7   | What's inside (`#features`)     | Plan (the tools)                | Scope promise: six tools, no machinery; **Sheets/Workflows = New** | 1, 3        |
| 8   | Switching (`#switch`)           | Objection: migration            | Trello/Asana/Notion land in an afternoon; no fragile sync          | 1           |
| 9   | Pricing                         | CTA + value                     | Free solo · $12 Pro w/ full Atlas · BYOK wedge                     | 1, 3        |
| 10  | Open source                     | Guide authority                 | AGPL = verifiable trust; self-host path                            | 2           |
| 11  | FAQ                             | Objections, long tail           | Sheets, self-host, AI pricing, free-plan Atlas                     | all         |
| 12  | Final CTA                       | CTA + Success                   | "Bring one messy project."                                         | all         |
| 13  | Footer                          | Legal/trust                     | AGPL-3.0 + built-on-Plane attribution, ™ marks                     | 2, legal    |

## Section specs (current copy = canonical)

### 2 · Hero

- Badge pill: `ATLAS™ DRAFTS. YOU APPROVE.` — the trust beat **first** because agent distrust is the market's top objection (see ICP doc, McKinsey 62%).
- H1: `Where ideas become work.` — identical to the app login tagline; never let these drift.
- Sub: `DragonFruit™ is the calm workspace — tasks, docs, and sheets — where Atlas, your AI teammate, turns raw notes into drafts, plans, and shipped tasks.`
- CTAs: Start free (primary) · See pricing. Chips: Tasks · Docs · Sheets · Atlas · BYOK · AGPL.
- Rules: H1 stays one line ≥701px; ™ once on DragonFruit + badge Atlas; don't add a third CTA.

### 3 · Hero product window

Mock of the real app (rail, sidebar incl. **Sheets**, project header, brain-dump doc card, Atlas suggestion card with approval line). Rule: everything shown must exist in-product; when a real product GIF/video ships (backlog), it replaces the static center, not the frame.

### 5 · Problem

H2 `The gap between idea and work is where momentum dies.` — three cards: context scattered / AI starts blank / project archaeology. Rule: cards name pains, never competitors.

### 6 · Atlas

H2 `Hand off the busywork. Keep the credit.` + sub opening `Give Atlas the raw idea.` Four verb cards = the SB7 plan. Rule: verbs stay humble (drafts, surfaces, waits) — no autonomy theater.

### 7 · What's inside

H2 `A full workspace, kept deliberately small.` Six cards: Tasks / Docs / **Sheets (New)** / **Workflows (New)** / Capture / Integrations. Rule: max two "New" chips at any time; feature copy must answer a pain, not list specs.

### 8 · Switching

H2 `Bring your current setup with you.` Ledger strip: Trello (Boards→Projects, Cards→Tasks, Labels→Labels) · Asana (Projects→Projects, Sections→States, Assignees→Owners) · Notion (Databases→Task lists, Pages→Docs, Tags→Labels). Note: one-time import, no fragile two-way sync; Atlas triages what lands. **Honesty gate:** Trello JSON mapper + Asana auto-detect must ship before paid traffic points here.

### 9 · Pricing

H2 `Free for tasks and docs. Paid when Atlas joins the work.` Anchor context (from research): Notion locks AI behind $20 Business; ClickUp AI effective $16–35/user. Our line: **Pro $12 includes full Atlas; bring your own key so AI costs stay yours.** Rule: never hide the markup — "about 1.4× model cost" on Atlas Cloud is a trust feature.

### 11 · FAQ

Current five: What is DragonFruit / What are Sheets / Is Atlas in free Cloud / Can I self-host / How does AI pricing work. Rule: answers ≤ 2 sentences, no internal jargon (no "funnel," no "ICP").

### 12 · Final CTA

`Bring one messy project. Let Atlas organize the next move.` + end-card line `Open-source. Self-hostable. Bring your own AI key.` Rule: this section always mirrors the TikTok end-card exactly.

## Objection → answer matrix

| Objection (voice of customer)      | Answered by                                         | Evidence to keep handy                                            |
| ---------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| "Can I trust an AI in my tracker?" | Hero badge, Atlas §6 Approve card, FAQ              | 62% worker distrust; oversight = top trust factor (McKinsey 2026) |
| "AI pricing will creep on me"      | Pricing §9 BYOK, FAQ                                | Notion AI → $20 tier; ClickUp Brain $9–28 add-on                  |
| "Migration will eat a quarter"     | Switching §8                                        | One-afternoon import; `external_id` dedupe in schema              |
| "Open source until it isn't"       | Open source §10, footer                             | AGPL-3.0; public repo; built-on-Plane attribution                 |
| "Too simple for real work"         | What's inside §7 (Sheets, Workflows, custom fields) | —                                                                 |
| "Another tool to learn"            | Hero mockup + (backlog) 45s demo                    | Demo = onboarding                                                 |

## Measurement plan

Events (add via lightweight analytics, respect DNT): `hero_cta_click`, `pricing_cta_click`, `final_cta_click`, `demo_play` (when shipped), `section_view` (4/5/6/7/8/9/10/12), `faq_open` (per question), outbound `github_click`. Segment by referrer bucket: tiktok / hn-reddit / search / direct — these proxy ICP 3 / 2 / 1. Review weekly against the validation plan in the ICP doc.

## Test backlog (one variable at a time)

1. H1: `Where ideas become work.` vs `Turn messy ideas into shipped work.` (SOT alternates carry the losers).
2. Badge: trust beat (`Atlas™ drafts. You approve.`) vs category (`The calm AI workspace`).
3. Pricing sub: with vs without explicit Notion/ClickUp anchor line.
4. Proof strip position: above vs below Problem.
5. Final CTA: `Bring one messy project` vs `Give Atlas your Friday brain-dump`.

## Build backlog (content the spec expects)

- [ ] 45s flagship demo embed in hero window (SOT clip #1) — replaces static mock center.
- [ ] Trello JSON mapper + Asana auto-detect (honesty gate for §8).
- [ ] Social proof slot after §6 (design reserved; ship only with real logos/quotes — no fake counts).
- [ ] `/self-host` subpage for ICP 2 (compose file above the fold), linked from §10.
- [ ] SEO comparison pages: "open-source Notion AI alternative", "self-hosted AI project management", "ClickUp Brain alternative".
- [ ] OG image refresh with new H1.

## Do-not list

- No autoplaying sound, no exit-intent modals, no fake urgency/scarcity — "calm" is the product; the page must behave calm.
- No dark patterns in pricing; the markup stays visible.
- No section without an SB7 beat — if it doesn't advance the story, it's clutter.
