# Project Brief — "DragonFruit: Path to Revenue"

> **Instructions for Atlas:** Create a new project named **"DragonFruit: Path to Revenue"** and organize it using the structure below. Each `## Module` is a **Module (epic)**. Each `- [ ]` line is a **Task** — create it with the given title, description, priority, labels, and suggested assignee. Use the `phase-1` / `phase-2` / `phase-3` labels to sequence work instead of cycles (this workspace intentionally has no cycles). Where assignee is "Atlas", assign the task to yourself. Create the labels in the Labels section first. After creating everything, post a summary comment on the project with task counts per module.

---

## Product principles (keep these true)

- **Simple but powerful.** DragonFruit is a calm workspace of **tasks + docs** — nothing more. No cycles, no views, no sprint machinery. Simplicity is the product.
- **One Atlas.** Atlas is a single, fixed AI teammate (one name, one personality, one avatar) — like Jarvis, it can do anything. Users do **not** create or name their own agents. "Hire an AI teammate" is marketing language for *meeting Atlas*, never a feature for spawning custom agents.
- **Bring your own key (BYOK).** Users supply their LLM key → near-zero COGS → high margin. Managed "Atlas Cloud" exists for those who'd rather pay per use.
- **Open source as funnel.** AGPL-3.0 (fork of Plane). Moat = hosting + Atlas Cloud + brand + execution, not code secrecy.

---

## Project overview

**Goal:** Take DragonFruit from "great product, no revenue" to "selling subscriptions" as fast as legally and technically possible.

**One-line thesis:** *The open-source, beautiful tasks + docs workspace with Atlas, your one AI teammate — sold hosted, with bring-your-own-key economics.*

**Success metrics (first 90 days):**
- Billing live: can charge a paying customer (Stripe).
- First 10 paying Cloud customers.
- Free → Pro conversion working (Atlas gated behind Pro).
- 3+ viral content pieces published from the TikTok channel.
- Trademark application filed; ™ in use immediately.

**Critical gap:** there is **no billing code in the repo today.** That is the #1 blocker to revenue.

---

## Labels (create these first)

- `monetization`
- `atlas-cloud`
- `gtm`
- `content`
- `legal`
- `product`
- `infra`
- `quick-win`
- `blocker`
- `phase-1`
- `phase-2`
- `phase-3`

---

## ICPs (reference — do not create as tasks)

1. **AI-forward startups / small teams (5–50)** — want Atlas doing triage, drafting, grooming inside the tracker. Primary revenue.
2. **Privacy / self-host teams** — need self-host + BYOK; pay for support/managed instances.
3. **AI-curious creators, beginners, builders (TikTok audience)** — top-of-funnel volume + evangelism. Low ACV, high distribution value via the founder's channel.

---

## Module: MON — Billing & Monetization

> Make DragonFruit sellable. Critical path. Build as a clean-room, non-AGPL-derivative module so it stays separable.

- [ ] **Set up Stripe account + products/prices** — Define products: Free, Pro (~$10–12/user/mo), Business (~$20–24/user/mo). Use Stripe-hosted Checkout to start. `monetization` `blocker` `phase-1` — Assignee: Human
- [ ] **Design subscription data model** — `WorkspaceSubscription` (plan, status, seats, stripe_customer_id, stripe_subscription_id, trial_ends_at, current_period_end) in a NEW separate Django app, not intermingled with `@plane/*` code. `monetization` `product` `phase-1` — Assignee: Human
- [ ] **Stripe Checkout + Billing Portal integration** — Endpoints to start checkout and redirect to the hosted portal for plan changes/cancel. `monetization` `phase-1` — Assignee: Human
- [ ] **Stripe webhook handler (idempotent)** — Handle `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed`; sync to `WorkspaceSubscription`. `monetization` `blocker` `phase-1` — Assignee: Human
- [ ] **Feature-gate Atlas behind Pro+** — Free = solo, tasks + docs, NO Atlas. Pro+ = full Atlas. Server-side `plan_allows(workspace, feature)` check on all Atlas endpoints. `monetization` `product` `blocker` `phase-2` — Assignee: Human
- [ ] **Seat enforcement** — Block inviting members beyond purchased seats with an upgrade CTA. `monetization` `product` `phase-2` — Assignee: Human
- [ ] **Upgrade/paywall UI** — In-app upgrade prompts on gated features → Stripe Checkout. `monetization` `gtm` `phase-2` — Assignee: Human
- [ ] **14-day Pro trial + auto-downgrade** — New workspace gets Pro trial, drops to Free at expiry. `monetization` `phase-2` — Assignee: Human
- [ ] **Atlas: draft the Billing Service PRD as a project Doc** — Use the PRD appendix below; format it as a Doc with headings + acceptance criteria. `monetization` `product` `phase-1` — Assignee: Atlas
- [ ] **Atlas: write the billing QA test plan** — Checklist covering upgrade, downgrade, seat overflow, failed payment, trial expiry, webhook replay. `monetization` `quick-win` `phase-2` — Assignee: Atlas

---

## Module: MET — Atlas Cloud (Managed LLM Metering)

> For users who don't want BYOK: proxy LLM calls and bill usage with a markup. `cost_usd` telemetry already exists per run/message — build billing on top.

- [ ] **Managed LLM gateway** — Route Atlas calls through a managed gateway (e.g. Vercel AI Gateway) when a workspace opts into Atlas Cloud instead of BYOK. `atlas-cloud` `infra` `phase-2` — Assignee: Human
- [ ] **Usage aggregation** — Sum `AgentRun.cost_usd` + `AgentChatMessage.cost_usd` per workspace per period. `atlas-cloud` `phase-2` — Assignee: Human
- [ ] **Markup + metered Stripe billing** — Apply markup (cost × ~1.3–1.5), report usage to Stripe metered billing, surface "this month's Atlas usage" in-app. `atlas-cloud` `monetization` `phase-2` — Assignee: Human
- [ ] **Usage caps & alerts** — Per-workspace spend cap + alert at 80% to prevent bill shock. `atlas-cloud` `product` `phase-3` — Assignee: Human
- [ ] **Atlas: design the BYOK vs Atlas-Cloud toggle UX + copy** — Explain the tradeoff: own key (free, you manage it) vs managed (pay-per-use, zero setup). `atlas-cloud` `product` `phase-2` — Assignee: Atlas

---

## Module: PKG — Cloud Launch & Packaging

> Make the hosted product real and the self-host funnel smooth.

- [ ] **Pricing & packaging page** — Landing (Astro) page with the 3 tiers + feature matrix. `gtm` `product` `phase-1` — Assignee: Human
- [ ] **One-click self-host deploy** — Polish self-host docs + one-click deploy (Coolify/Docker); CTA "upgrade to Cloud to skip ops." `infra` `gtm` `phase-1` — Assignee: Human
- [ ] **AGPL compliance footer + attribution** — Visible AGPL notice, link to source, "built on Plane." Required to sell legally. `legal` `blocker` `quick-win` `phase-1` — Assignee: Human
- [ ] **Onboarding: land users in a populated demo + meet Atlas** — New-workspace flow that drops users into a seeded project where Atlas introduces itself and does one useful thing in 60 seconds. `product` `gtm` `phase-2` — Assignee: Human

---

## Module: ATLAS — Activation & Positioning

> Atlas is the single fixed teammate. This module is about making it feel like a real teammate and the reason to pay — NOT about user-created agents.

- [ ] **"Meet Atlas" first-run moment** — On first workspace load, Atlas greets the user and offers to organize a brain-dump into tasks. `product` `gtm` `phase-2` — Assignee: Human
- [ ] **Atlas everywhere it should be** — Assignable to tasks, @-mentionable, present in the mac menu-bar inbox; consistent fixed identity/avatar across web, mobile, mac. `product` `phase-2` — Assignee: Human
- [ ] **Approval-gate UX polish** — Make the "Atlas asks permission before risky actions" moment clear and trustworthy (this is a key trust + demo beat). `product` `phase-2` — Assignee: Human
- [ ] **Atlas: write Atlas's canonical intro + capability copy** — One-paragraph "who is Atlas," plus a short list of what it can do, for onboarding + site. `content` `product` `quick-win` `phase-1` — Assignee: Atlas

---

## Module: GTM — Go-To-Market & Content

> Leverage the founder's TikTok channel and OSS-led growth. Low CAC.

- [ ] **Viral clip: "I gave my to-do list an AI teammate"** — See full concept below. 30–45s for TikTok/Reels/Shorts. `content` `gtm` `quick-win` `phase-1` — Assignee: Human
- [ ] **Content series plan (8 clips)** — Recurring "Atlas did ___ today" series, each clip mapped to a capability (organizing a brain-dump, drafting a doc, triaging, meeting notes via mac app). `content` `gtm` `phase-1` — Assignee: Human
- [ ] **OSS launch posts** — HN / r/selfhosted / Lobsters: "open-source, self-hostable workspace with one powerful AI teammate (BYOK)." `gtm` `phase-1` — Assignee: Human
- [ ] **SEO landing content** — "open-source Notion + tasks alternative," "self-hosted workspace with AI," "AI assistant for your projects." `gtm` `content` `phase-2` — Assignee: Human
- [ ] **Atlas: draft 8 TikTok scripts** — Hook + 3-beat scripts, ≤45s, optimized for the "watch Atlas do the work" payoff. `content` `gtm` `phase-1` — Assignee: Atlas
- [ ] **Atlas: write OSS launch copy** — HN post + Reddit post + tweet thread: open-source, self-host, BYOK, one AI teammate. `content` `gtm` `quick-win` `phase-1` — Assignee: Atlas

### THE VIRAL CLIP CONCEPT (reference for GTM-1)

**Title:** "I gave my to-do list an AI teammate. It actually did the work."

**Hook (0–3s):** Screen recording — a messy brain-dump note. Founder: *"Watch me make my AI teammate organize my whole week."*

**Beat 1 (3–15s):** @-mention **Atlas**: *"organize this into tasks and prioritize."* Cut to tasks materializing — fast, satisfying.

**Beat 2 (15–30s):** Assign Atlas a task: *"draft the launch doc."* It comments "On it…", a full doc appears. A risky action ("mark Done") pops an **approval** card — *"It even asks permission before the scary stuff."*

**Payoff (30–45s):** Founder closes the laptop, opens the **Mac menu-bar app** — Atlas finished overnight. Caption: *"Open-source. Self-hostable. Bring your own AI key. Link in bio."*

**Why it works:** concrete, fast, shows a *result* not a chatbot, and the approval beat builds trust. Atlas is one consistent character across the whole series — viewers get to "know" it.

---

## Module: LEGAL — Trademark & Compliance (parallel, non-blocking)

- [ ] **Trademark clearance check** — USPTO TESS + domain/social search for "DragonFruit" / "Atlas" in software. Confirm no senior conflicting mark. `legal` `blocker` `quick-win` `phase-1` — Assignee: Human
- [ ] **Use ™ immediately** — Add ™ to "DragonFruit" and "Atlas" in product + site (common-law rights, no filing needed). Lets us sell now. `legal` `quick-win` `phase-1` — Assignee: Human
- [ ] **File trademark applications** — File in parallel; protection backdates to filing. `legal` `phase-2` — Assignee: Human
- [ ] **Keep enterprise add-ons clean-room** — Rule: billing, SSO/SAML, audit logs live in separate non-AGPL-derivative packages. `legal` `product` `phase-2` — Assignee: Human

---

## Module: ENT — Enterprise & Upmarket (backlog — do not start yet)

- [ ] **SSO / SAML (clean-room package)** — `product` `monetization` `phase-3` — Assignee: Human
- [ ] **Audit logs** — `product` `phase-3` — Assignee: Human
- [ ] **Self-host support contract / managed instance offering** — `monetization` `gtm` `phase-3` — Assignee: Human

---

# APPENDIX — Billing Service PRD

> Atlas: create this as a standalone project Doc (task MON "draft the Billing Service PRD").

## 1. Problem
DragonFruit has no way to charge money — zero billing/Stripe code in the repo. Without it, the Cloud strategy generates no revenue.

## 2. Goal
Let a workspace subscribe to a paid plan, pay per seat, optionally pay metered Atlas Cloud usage, with features gated by plan — built clean-room and separable from the AGPL Plane base.

## 3. Non-goals
- No custom payment processor (use Stripe).
- No enterprise invoicing/PO in v1 (manual).
- Atlas Cloud metering is module MET, layered on after.

## 4. Plans
| Plan | Price | Includes |
|---|---|---|
| Free | $0 | 1 user, tasks + docs, **no Atlas** |
| Pro | ~$10–12 / user / mo | Unlimited members, **full Atlas**, mac app, integrations, priority support |
| Business | ~$20–24 / user / mo | + SSO/SAML, audit logs, SLA |

## 5. Functional requirements
1. Subscribe via Stripe-hosted Checkout.
2. Manage/cancel/change plan via Stripe Billing Portal.
3. Idempotent webhook keeps `WorkspaceSubscription` in sync (active, past_due, canceled, trialing).
4. Seat counting: members ≤ purchased seats; block overflow with upgrade prompt.
5. Server-side `plan_allows(workspace, feature)` gating on Atlas/integration/SSO endpoints.
6. 14-day Pro trial on new workspace, auto-downgrade to Free.
7. Dunning: on `invoice.payment_failed`, grace period + banner; downgrade after N failures.

## 6. Data model (new, separate app)
`WorkspaceSubscription`: workspace_id, plan, status, seats_purchased, stripe_customer_id, stripe_subscription_id, trial_ends_at, current_period_end, created/updated.

## 7. Compliance note
New Django app (e.g. `billing/`) with no imports from `@plane/*` derivative internals beyond stable public interfaces, so it stays independently licensable. Stripe keys via secret manager, never in repo.

## 8. Acceptance criteria
- [ ] New workspace auto-gets a 14-day Pro trial.
- [ ] Admin upgrades via Checkout, charged correctly per seat.
- [ ] Atlas inaccessible on Free, accessible on Pro+.
- [ ] Inviting beyond seats is blocked with an upgrade CTA.
- [ ] Cancel downgrades at period end, not immediately.
- [ ] Failed payment → grace period → downgrade.
- [ ] Subscription state survives webhook replay (idempotent).

## 9. Metrics
MRR, paid workspaces, seats sold, trial→paid %, Free→Pro %, churn.

---

# APPENDIX — TikTok Content Ideas (@rengi.mp4)

> Channel reality: productivity + AI + builder content. Goal of every clip: show Atlas producing a *result* fast, end on the same CTA ("Open-source. Self-hostable. BYO AI key. Link in bio."). Keep Atlas as one recurring character so viewers get to know "him."

**Unified hook formula:** *"I gave my [X] an AI teammate — watch it [do the work]."*

### Series A — "Watch Atlas do it" (the core, highest-converting)
1. **Brain-dump → organized week.** Paste a chaotic note, @Atlas "organize and prioritize," tasks materialize. The flagship clip.
2. **"Draft the doc."** Assign Atlas a task, it writes a full launch/spec doc in the comments. Payoff = the doc appearing.
3. **The approval moment.** Atlas tries to mark something Done → permission card pops. "My AI asks before doing the scary stuff." Trust beat.
4. **Triage hell.** 30 messy tasks → Atlas labels, prioritizes, assigns in seconds.
5. **Overnight teammate.** Close laptop, open the Mac menu-bar app next morning — Atlas finished while you slept.
6. **Meeting → tasks.** Drop meeting notes, Atlas extracts action items as tasks. (Pairs with the mac app voice capture.)

### Series B — "Why this is different" (positioning / education)
7. **"I don't pay per AI message."** Explain BYOK — plug in your own key, the AI is basically free to run. Money-saving angle plays huge.
8. **"Self-hosted, so it's mine."** Run it on your own server, your data never leaves. For the privacy crowd.
9. **"Open-source Notion + AI."** Side-by-side vs bloated tools — DragonFruit is just tasks + docs + Atlas.
10. **"It's free for one person."** Solo creators: full workspace, $0. Soft upsell to Atlas.

### Series C — "Build in public" (founder story — your audience loves this)
11. **"I forked a $100M tool and added AI."** The origin story — built on open-source Plane, added Atlas.
12. **"Day in the life building DragonFruit."** Show yourself using Atlas to manage building Atlas (meta, very shareable).
13. **"I shipped this with my AI teammate's help."** Before/after of a feature, Atlas in the loop.
14. **Milestone reactions.** "First paying customer," "1000 stars" — bring the audience along; they become evangelists.

### Series D — "Productivity, generally" (top-of-funnel, low product mention)
15. **"My system for never losing an idea."** Pure productivity tip, DragonFruit shown subtly as the tool.
16. **"5 things I stopped doing manually."** Each = an Atlas capability, but framed as a habit/tip.
17. **"How I plan my week in 4 minutes."** Speedrun using the workspace + Atlas.

**Production notes:** screen-record real usage (authenticity beats mockups), keep each ≤45s, captions on, end-card CTA identical every time, pin the flagship clip (#1). Post Series A for conversion, Series D for reach, Series C for loyalty.
