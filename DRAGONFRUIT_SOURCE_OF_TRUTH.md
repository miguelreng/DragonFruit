# DragonFruit — Source of Truth

> The single canonical document for DragonFruit: what it is, who it's for, how it makes money, how we talk about it, and the engineering PRDs for everything code-related. This supersedes `ATLAS_PROJECT_BRIEF.md`.
>
> **Structure:** Part 1 = Strategy. Part 2 = Engineering PRDs (code). Part 3 = Execution plan (Atlas-ingestible project structure).

---

# PART 0 — YOUR ACTION ITEMS (founder — Miguel)

> Decisions and personal to-dos that came out of this chat. These are things only you can do or decide; the team/engineering work lives in Parts 2–3.

## Decide (blocks everything downstream)

- [ ] **Lock the pricing numbers.** Pro/Business prices are illustrative (§1.5) — confirm the real numbers before Stripe setup.
- [ ] **Confirm the hosting plan for DragonFruit Cloud** (where `app.dragonfruit.sh` runs; current topology = Vercel web + Coolify API).
- [ ] **Decide on the business entity** for taking payments (Stripe needs a legal entity / bank account).
- [ ] **Decide whether Atlas may create projects.** Atlas chat can create Tasks and Docs inside an existing project, but project creation remains manual unless an explicitly approved tool is added (see PRD-4).

## Do this week (quick wins, unblock selling)

- [ ] **Run the trademark clearance check** — USPTO TESS + domains/socials for "DragonFruit" and "Atlas" in software. Only real blocker to the name.
- [ ] **Add ™** to "DragonFruit" and "Atlas" in the product + site (no filing needed; lets you sell now).
- [ ] **Ship the AGPL footer + "built on Plane" attribution** (or assign it) — required to sell legally.
- [ ] **Record the flagship TikTok clip** (#1: brain-dump → organized week) and pin it.

## Set up

- [ ] **Create the Stripe account** + products/prices once numbers are locked.
- [ ] **Create the "DragonFruit: Path to Revenue" project** from Part 3 (or hand it to Atlas if creation tools exist).
- [ ] **File the trademark applications** in parallel (after clearance).

## Housekeeping

- [ ] **Delete `ATLAS_PROJECT_BRIEF.md`** — superseded by this doc (confirm, then remove).
- [ ] **Keep §1.8 positioning copy in sync** with the live homepage + TikTok scripts (single source of truth for messaging).
- [ ] **Make "free to self-host" prominent in messaging.** The thesis confusion showed the site/copy must clearly say _self-hostable for free, hosted Cloud for those who'd rather not_ — don't let "hosted" read as the only option, or the OSS crowd bounces.

---

# PART 1 — STRATEGY

## 1.1 What DragonFruit is

DragonFruit is an open-source (AGPL-3.0) **calm home for work that remembers**: ideas, Tasks, Docs, Sheets, decisions, and project context, with one built-in AI teammate, Atlas. It's a fork of [Plane](https://github.com/makeplane/plane) with a Craft-inspired docs experience and a real server-side agent runtime.

**Customer thesis:** _A quiet place where ideas become work. Start anywhere; your context stays here._

**Business thesis:** _DragonFruit is the trusted, AI-native system of record and execution layer beneath interchangeable AI interfaces. It is free to self-host and monetized through hosted Cloud, recurring workflows, governance, and optional managed model usage._

> Story and business proposal: [docs/strategy/ai-native-story-and-business-proposal.md](docs/strategy/ai-native-story-and-business-proposal.md)

## 1.2 Product principles (non-negotiable)

- **Simple but powerful.** The product is **tasks + docs**. No cycles, no views, no sprint machinery. Simplicity is the product.
- **One Atlas.** Atlas is a single, fixed AI teammate — one name, one personality, one avatar, like Jarvis. Users do **not** create or name their own agents. "Hire an AI teammate" is marketing language for _meeting Atlas_, never a feature.
- **Start anywhere; work stays here.** Users may begin in DragonFruit or an authorized external AI surface. DragonFruit remains the home of the work, permissions, approvals, and history.
- **Memory must be legible.** Canonical context is visible, correctable, sourced, and user-owned. Hidden model memory is never the moat.
- **Bring your own key (BYOK).** Users supply their LLM key → near-zero COGS → high margin. Managed "Atlas Cloud" exists for those who'd rather pay per use.
- **Open source as funnel.** AGPL forces the code open; the moat is hosting + Atlas Cloud + brand + execution, **not** code secrecy. We compete on trust, polish, and the agent — not on hiding source.

## 1.3 Jobs-to-be-done

**Primary job:**

> _When my ideas and work move between chats, meetings, Docs, and Tasks, I want one quiet place that keeps the context and follows the work through, so I can move faster without re-explaining the project or becoming its admin layer._

**By ICP:**

- **AI-forward teams:** _I want the AI I already use to safely act on the same project context and work my team shares, with DragonFruit keeping the record and asking for approval._
- **Privacy / self-host teams:** _I want AI leverage without giving up control of my data or costs._
- **Creators / beginners (TikTok audience):** _I want the AI magic without the learning curve — one workspace, one AI that "just does it."_

**Emotional/social job:** _I want to feel — and look — like someone who has it together and works with the future._

## 1.4 ICPs

> Deep profiles, market evidence, objection maps, and the validation plan: [docs/ux/01-icp-profiles.md](docs/ux/01-icp-profiles.md)

1. **AI-forward startups / small teams (5–50).** Primary revenue. Want Atlas doing triage, drafting, grooming inside the tracker.
2. **Privacy / self-host teams.** Need self-host + BYOK; pay for support / managed instances.
3. **AI-curious creators, beginners, builders.** Top-of-funnel volume + evangelism via the founder's TikTok (@rengi.mp4). Low ACV, high distribution value.

## 1.5 Business model & pricing

Four lanes:

- **Open source (self-host, free):** full product, AGPL. Funnel + trust.
- **DragonFruit Cloud (hosted SaaS):** primary revenue. Test workspace-base pricing with included seats against the existing per-seat proposal.
- **Recurring workflows:** paid value tied to sustained shared context, approvals, and follow-through rather than chat volume.
- **Atlas Cloud (managed LLM metering):** usage upside for users who don't want BYOK.

| Plan            | Price (illustrative; validate) | Includes                                                                                                                                                    |
| --------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Free**        | $0                             | 1 user, Tasks + Docs, and enough Atlas actions to experience the core loop                                                                                  |
| **Pro**         | TBD                            | Shared context, recurring workflows, approvals, MCP/external AI access, mac app, integrations, and priority support; test workspace-base vs per-seat pricing |
| **Business**    | TBD                            | + SSO/SAML, governance, audit controls, SLA                                                                                                                 |
| **Atlas Cloud** | usage (cost × ~1.3–1.5 markup) | Managed LLM — no key to manage; metered per token with caps and alerts                                                                                       |

**COGS note:** Cost of Goods Sold = direct cost to serve a customer. With BYOK, the user pays inference, so COGS ≈ hosting only → ~85–90%+ gross margin.

**Packaging decision gate:** do not implement a permanent “Free = no Atlas” paywall or final seat enforcement until the limited-Atlas activation and workspace-base pricing experiments are reviewed.

## 1.6 Moat / durable advantage

- **Context gravity** — Briefs, decisions, Tasks, Docs, history, and source relationships compound into a user-owned project memory.
- **Trusted execution** — permissions, approvals, idempotency, attribution, and recovery make actions dependable across AI interfaces.
- **Recurring workflows** — planning, follow-up, and reporting become a repeatable operating loop rather than isolated prompts.
- **Interoperable surfaces** — web, Mac, mobile, browser, API, and MCP all act on the same canonical workspace.
- **Ownership** — AGPL, self-hosting, export, and BYOK reduce model and platform dependency.

## 1.7 Go-to-market

- **OSS-led PLG:** self-host repo + one-click deploy → GitHub stars → "upgrade to Cloud to skip ops."
- **Lead with the weekly loop, not a chatbot.** Demo messy input becoming an approved plan, followed work, and a useful report.
- **Distribute through existing AI surfaces:** users can discover and use DragonFruit from the AI interface already open while DragonFruit retains the workspace relationship.
- **TikTok engine (@rengi.mp4):** free CAC. See content plan §1.9.
- **Communities:** HN / r/selfhosted / Lobsters — where AGPL + self-host + BYOK is a feature.

## 1.8 Positioning copy (single source — keep these in sync)

> Strategic narrative and business proposal: [docs/strategy/ai-native-story-and-business-proposal.md](docs/strategy/ai-native-story-and-business-proposal.md) · Full narrative system: [docs/ux/02-brand-story.md](docs/ux/02-brand-story.md) · Landing implementation spec: [docs/ux/03-landing-ux-spec.md](docs/ux/03-landing-ux-spec.md)

**Homepage headline:**

> Eyebrow: _Start anywhere. Your context stays here._
>
> **A quiet place where ideas become work.**
>
> Sub: DragonFruit™ keeps your ideas, Docs, Tasks, and project context together. Atlas™, your AI teammate, helps move the work forward—and asks before anything important changes.
>
> Trust line: _Open-source. Self-hostable. Bring your own AI key._
>
> Narrative frame: _your work has a home; it remembers what matters and keeps moving._

**Supporting lines:** _A quiet place where your work keeps its context._ / _Start anywhere. Your work stays together._ / _Your work, with its memory intact._ / _Atlas remembers the project—not just the prompt._ / _Bring the mess. Keep the meaning. Move the work._

**TikTok hook (spoken, first 3s):** _"I gave my to-do list an AI teammate — watch it do my actual work."_

**Universal end-card CTA:** _Open-source. Self-hostable. Bring your own AI key. Link in bio._

## 1.9 TikTok content plan (@rengi.mp4)

Unified hook formula: _"I gave my [X] an AI teammate — watch it [do the work]."_ Keep Atlas as one recurring character.

**Series A — "Watch Atlas do it" (conversion):**

1. Brain-dump → organized week (FLAGSHIP, pin this)
2. "Draft the doc" → full doc appears in comments
3. The approval moment (trust beat)
4. Triage 30 messy tasks in seconds
5. Overnight teammate (mac menu-bar app finished while you slept)
6. Meeting notes → tasks

**Series B — "Why this is different" (positioning):** 7. "I don't pay per AI message" (BYOK) 8. "Self-hosted, so it's mine" (privacy) 9. "Open-source Notion + AI" 10. "It's free for one person"

**Series C — "Build in public" (loyalty):** 11. "I forked a $100M tool and added AI" 12. Day in the life building DragonFruit (using Atlas to build Atlas) 13. "I shipped this with my AI teammate's help" 14. Milestone reactions (first customer, 1000 stars)

**Series D — "Productivity, generally" (reach):** 15. "My system for never losing an idea" 16. "5 things I stopped doing manually" 17. "How I plan my week in 4 minutes"

**Production:** real screen recordings, ≤45s, captions on, identical end-card CTA, pin #1. A for conversion, D for reach, C for loyalty.

## 1.10 Legal — sell ASAP without waiting on trademark

- Use **™** on "DragonFruit" and "Atlas" immediately (common-law rights, no filing). Lets us sell now.
- Run a **clearance check** (USPTO TESS + domains/socials) — the only real blocker.
- **File** the trademark in parallel; protection backdates to filing.
- Ship the **AGPL notice + "built on Plane" attribution** in the footer (required to sell legally).
- Keep enterprise add-ons (billing, SSO, audit) in **clean-room, non-AGPL-derivative packages**.

---

# PART 2 — ENGINEERING PRDs (CODE)

> Build all monetization/enterprise code as clean-room Django apps that do **not** import `@plane/*` derivative internals beyond stable public interfaces, so they stay independently licensable. Secrets via secret manager, never in repo.

## PRD-1 — Billing Service (CRITICAL PATH)

### Problem

There is **no billing/subscription/Stripe code in the repo.** Without it, the Cloud strategy generates zero revenue. This is the #1 blocker.

### Goal

A workspace can subscribe to a paid plan, pay per seat, and have features gated by plan.

### Non-goals

- No custom payment processor (use Stripe).
- No enterprise invoicing/PO flows in v1 (manual).
- Atlas Cloud metering is PRD-3, layered on after.

### Functional requirements

1. Subscribe via **Stripe-hosted Checkout**.
2. Manage / cancel / change plan via **Stripe Billing Portal**.
3. **Idempotent webhook** keeps `WorkspaceSubscription` in sync: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
4. **Seat counting:** members ≤ seats_purchased; block overflow with upgrade CTA.
5. **14-day Pro trial** on new workspace, auto-downgrade to Free at expiry.
6. **Dunning:** on `invoice.payment_failed` → grace period + in-app banner → downgrade after N failures.

### Data model (new `billing/` app)

`WorkspaceSubscription`: `workspace_id`, `plan` (free|pro|business), `status` (active|trialing|past_due|canceled), `seats_purchased`, `stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at`, `current_period_end`, `created_at`, `updated_at`.

### Acceptance criteria

- [ ] New workspace auto-gets a 14-day Pro trial.
- [ ] Admin upgrades via Checkout and is charged correctly per seat.
- [ ] Inviting beyond seats is blocked with an upgrade CTA.
- [ ] Cancel downgrades at period end, not immediately.
- [ ] Failed payment → grace period → downgrade.
- [ ] Subscription state survives a webhook replay (idempotent).

### Metrics

MRR, paid workspaces, seats sold, trial→paid %, churn.

---

## PRD-2 — Plan-based Feature Gating

### Problem

Atlas and premium capabilities are currently available to everyone; nothing distinguishes Free from paid.

### Goal

Server-side enforcement of a configurable Free Atlas allowance and Pro+ capabilities, so every user can experience the differentiated core loop while paid workflow, collaboration, and governance limits remain tamper-resistant.

### Functional requirements

1. A single authority `plan_allows(workspace, feature) -> bool`, sourced from `WorkspaceSubscription`.
2. Entitlements/limits: `atlas_actions`, `recurring_workflows`, `external_ai_connections`, `managed_model_usage`, `sso`, `audit_controls`.
3. Enforcement is **server-side** on the relevant API endpoints (not just hidden in UI).
4. UI reads the same plan state to show upgrade prompts / paywalls on gated surfaces.
5. Free tier: hard-block adding a 2nd human member (1 user).
6. Free Atlas allowance and Pro packaging are configuration, not hard-coded constants, until the activation/pricing experiments conclude.

### Acceptance criteria

- [ ] A Free workspace can complete the configured number of Atlas actions and see remaining allowance.
- [ ] Exhausted allowances return a clear upgrade response without losing drafted user input.
- [ ] UI shows an upgrade CTA at the limit and explains which paid capability is required.
- [ ] Downgrading from Pro applies the configured Free limits at period end without deleting context or workflow history.
- [ ] Gating cannot be bypassed by calling the API directly.

### Dependencies

PRD-1 (needs `WorkspaceSubscription`).

---

## PRD-3 — Atlas Cloud (Managed LLM Metering)

### Problem

BYOK is friction for non-technical buyers. Some users will pay to skip key management.

### Goal

Let a workspace opt into managed LLM ("Atlas Cloud"): we proxy calls, meter usage, and bill with a markup. `cost_usd` telemetry already exists on `AgentRun` and `AgentChatMessage` — build billing on top.

### Functional requirements

1. **Gateway routing:** when a workspace selects Atlas Cloud (instead of BYOK), Atlas LLM calls route through a managed gateway (e.g. Vercel AI Gateway).
2. **Usage aggregation:** sum `AgentRun.cost_usd` + `AgentChatMessage.cost_usd` per workspace per billing period.
3. **Markup + metered billing:** apply markup (cost × ~1.3–1.5), report usage to Stripe metered billing, surface "this month's Atlas usage" in-app.
4. **Caps & alerts:** per-workspace spend cap + alert at 80% to prevent bill shock.
5. **BYOK vs Atlas Cloud toggle** in settings with clear copy on the tradeoff.

### Acceptance criteria

- [ ] A workspace can switch between BYOK and Atlas Cloud.
- [ ] Atlas Cloud usage is metered and billed via Stripe accurately.
- [ ] In-app usage view matches Stripe's reported usage.
- [ ] Spend cap halts further Atlas runs and notifies the admin.

### Dependencies

PRD-1 (Stripe + subscription), PRD-2 (gating).

---

## PRD-4 — Atlas Activation Surfaces (single fixed identity)

### Problem

Atlas exists but isn't presented as a present, trustworthy teammate — which is the whole product story and the reason to pay.

### Goal

Make Atlas feel like one consistent teammate everywhere, with a strong first-run moment. No user-created/custom-named agents.

### Functional requirements

1. **"Meet Atlas" first-run:** on first workspace load, Atlas greets the user and offers to organize a brain-dump into tasks.
2. **Fixed identity:** one name, personality, avatar — consistent across web, mobile, mac menu-bar app. Not editable per workspace.
3. **Presence:** Atlas is assignable to tasks, @-mentionable, and visible in the mac menu-bar inbox.
4. **Approval-gate UX:** the "Atlas asks permission before risky actions" card is clear and trustworthy (key trust + demo beat).
5. **Seeded onboarding project:** new workspaces land in a populated demo where Atlas does one useful thing in 60 seconds.

### Acceptance criteria

- [ ] First-run shows Atlas greeting + one-tap "organize my notes" action.
- [ ] Atlas identity is identical across all surfaces and not user-editable.
- [ ] Risky agent actions surface an approval card before executing.

### Current creation boundary

Atlas chat currently includes `create_task`, `create_document`, and canonical Project Brief update tools. The issue/page-comment runtime has a narrower action set, and no general Atlas surface creates projects. Any “let Atlas build the project” flow must either begin from an existing project through chat or add an explicitly approved project-creation tool; otherwise project creation remains manual.

---

## PRD-5 — Work from Anywhere

Make DragonFruit safely usable from authorized external AI clients while DragonFruit remains the system of record, permission authority, approval engine, and activity ledger.

Full PRD and implementation plan: [plans/ai-native/031-work-from-anywhere.md](plans/ai-native/031-work-from-anywhere.md)

## PRD-6 — Work That Remembers

Turn Workspace Brief, Project Brief, source Docs, and Atlas memory into a visible, sourced, correctable context hierarchy shared by native and authorized external surfaces.

Full PRD and implementation plan: [plans/ai-native/032-work-that-remembers.md](plans/ai-native/032-work-that-remembers.md)

## PRD-7 — Recurring Operating Loop

Productize one repeatable outcome: collect loose inputs, draft the week, obtain approval, execute accepted actions, follow blockers, and produce a linked progress report.

Full PRD and implementation plan: [plans/ai-native/033-recurring-operating-loop.md](plans/ai-native/033-recurring-operating-loop.md)

## PRD-8 — Project Context Sources

Let a project safely attach a bounded external folder—starting with a user-selected Google Drive folder—so Atlas can continue work from shared instructions, plans, and Claude/Codex handoffs. Source files are evidence with provenance and refresh state; only a reviewed proposal may change canonical context.

Full PRD and implementation plan: [plans/ai-native/053-project-context-sources.md](plans/ai-native/053-project-context-sources.md)

---

# PART 3 — EXECUTION PLAN (Atlas-ingestible)

> **For Atlas (or manual setup):** create a project **"DragonFruit: Path to Revenue."** Each `## Module` is a Module (epic); each `- [ ]` is a Task with the given labels, priority, and assignee. Sequence with `phase-1/2/3` labels (this workspace has no cycles by design). Assign "Atlas" tasks to yourself.

**Labels to create:** `monetization`, `atlas-cloud`, `gtm`, `content`, `legal`, `product`, `infra`, `quick-win`, `blocker`, `phase-1`, `phase-2`, `phase-3`.

## Module: MON — Billing & Monetization (implements PRD-1, PRD-2)

- [ ] **Set up Stripe account + products/prices** (Free/Pro/Business) — `monetization` `blocker` `phase-1` — Human
- [ ] **Design `WorkspaceSubscription` model** in a new `billing/` app — `monetization` `product` `phase-1` — Human
- [ ] **Stripe Checkout + Billing Portal integration** — `monetization` `phase-1` — Human
- [ ] **Idempotent Stripe webhook handler** — `monetization` `blocker` `phase-1` — Human
- [ ] **Run limited-Atlas vs no-Atlas activation test; lock entitlement configuration** — `monetization` `product` `blocker` `phase-1` — Human
- [ ] **Test workspace-base vs per-seat packaging before seat enforcement** — `monetization` `product` `blocker` `phase-1` — Human
- [ ] **`plan_allows()` entitlement and usage-limit enforcement** — `monetization` `product` `blocker` `phase-2` — Human
- [ ] **Seat enforcement + upgrade CTA** — `monetization` `product` `phase-2` — Human
- [ ] **In-app paywall/upgrade UI** — `monetization` `gtm` `phase-2` — Human
- [ ] **14-day Pro trial + auto-downgrade** — `monetization` `phase-2` — Human
- [ ] **Atlas: write billing QA test plan** — `monetization` `quick-win` `phase-2` — Atlas

## Module: MET — Atlas Cloud Metering (implements PRD-3)

- [ ] **Managed LLM gateway routing** — `atlas-cloud` `infra` `phase-2` — Human
- [ ] **Usage aggregation from `cost_usd`** — `atlas-cloud` `phase-2` — Human
- [ ] **Markup + Stripe metered billing + in-app usage view** — `atlas-cloud` `monetization` `phase-2` — Human
- [ ] **Spend caps & 80% alerts** — `atlas-cloud` `product` `phase-3` — Human
- [ ] **Atlas: design BYOK vs Atlas-Cloud toggle UX + copy** — `atlas-cloud` `product` `phase-2` — Atlas

## Module: ATLAS — Activation & Positioning (implements PRD-4)

- [ ] **"Meet Atlas" first-run moment** — `product` `gtm` `phase-2` — Human
- [ ] **Fixed Atlas identity across web/mobile/mac** — `product` `phase-2` — Human
- [ ] **Approval-gate UX polish** — `product` `phase-2` — Human
- [ ] **Seeded onboarding demo project** — `product` `gtm` `phase-2` — Human
- [ ] **Decide whether to add an explicitly approved Atlas project-creation tool** — `product` `phase-1` — Human
- [ ] **Atlas: write canonical Atlas intro + capability copy** — `content` `product` `quick-win` `phase-1` — Atlas

## Module: AIN — AI-Native Work System (implements PRD-5, PRD-6, PRD-7, PRD-8)

- [ ] **Run the paid four-week weekly-loop concierge cohort** — `product` `monetization` `blocker` `phase-1` — Human
- [ ] **Run the five-workspace assisted external-MCP pilot** — `product` `gtm` `phase-1` — Human
- [ ] **Ship Workspace Brief + context inspector + correction UX** — `product` `phase-2` — Human
- [ ] **Validate a compact Drive-folder context pack + Claude/Codex handoff convention with three workspaces** — `product` `phase-1` — Human
- [ ] **Ship read-only Drive project sources with provenance, source boundaries, and refresh state** — `product` `infra` `phase-2` — Human
- [ ] **Ship OAuth-authorized MCP and complete safe tool actions** — `product` `infra` `phase-2` — Human
- [ ] **Build the recurring operating loop only after its payment/retention gate passes** — `product` `monetization` `blocker` `phase-3` — Human
- [ ] **Instrument successful delegated workflows per active workspace/week** — `product` `gtm` `phase-1` — Human

## Module: PKG — Cloud Launch & Packaging

- [ ] **Pricing & packaging page (landing/Astro)** — `gtm` `product` `phase-1` — Human
- [ ] **One-click self-host deploy + docs** — `infra` `gtm` `phase-1` — Human
- [ ] **AGPL footer + "built on Plane" attribution** — `legal` `blocker` `quick-win` `phase-1` — Human

## Module: GTM — Go-To-Market & Content

- [ ] **Flagship viral clip: brain-dump → organized week** — `content` `gtm` `quick-win` `phase-1` — Human
- [ ] **Content series plan (17 clips, §1.9)** — `content` `gtm` `phase-1` — Human
- [ ] **OSS launch posts (HN / Reddit / Lobsters)** — `gtm` `phase-1` — Human
- [ ] **SEO landing content** — `gtm` `content` `phase-2` — Human
- [ ] **Atlas: draft 8 TikTok scripts from §1.9** — `content` `gtm` `phase-1` — Atlas
- [ ] **Atlas: write OSS launch copy** — `content` `gtm` `quick-win` `phase-1` — Atlas

## Module: LEGAL — Trademark & Compliance (parallel)

- [ ] **Trademark clearance check (DragonFruit / Atlas)** — `legal` `blocker` `quick-win` `phase-1` — Human
- [ ] **Use ™ immediately in product + site** — `legal` `quick-win` `phase-1` — Human
- [ ] **File trademark applications** — `legal` `phase-2` — Human
- [ ] **Document clean-room rule for enterprise add-ons** — `legal` `product` `phase-2` — Human

## Module: ENT — Enterprise & Upmarket (backlog — don't start yet)

- [ ] **SSO / SAML (clean-room package)** — `product` `monetization` `phase-3` — Human
- [ ] **Audit logs** — `product` `phase-3` — Human
- [ ] **Self-host support contract / managed instance offering** — `monetization` `gtm` `phase-3` — Human
