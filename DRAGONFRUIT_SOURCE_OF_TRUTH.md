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
- [ ] **Confirm: is Atlas allowed to create projects/tasks?** Verify whether the agent has `create_issue`/`create_project` tools — this decides whether Atlas can build the Part 3 project itself or you do it manually (see PRD-4 open question).

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

---

# PART 1 — STRATEGY

## 1.1 What DragonFruit is

DragonFruit is an open-source (AGPL-3.0) **tasks + docs workspace with one built-in AI teammate, Atlas.** It's a fork of [Plane](https://github.com/makeplane/plane) with a Craft-inspired docs experience and a real server-side agent runtime.

**Thesis:** *The open-source, beautiful tasks + docs workspace with Atlas, your one AI teammate. Free to self-host; monetized as a hosted Cloud, with bring-your-own-key economics.*

## 1.2 Product principles (non-negotiable)

- **Simple but powerful.** The product is **tasks + docs**. No cycles, no views, no sprint machinery. Simplicity is the product.
- **One Atlas.** Atlas is a single, fixed AI teammate — one name, one personality, one avatar, like Jarvis. Users do **not** create or name their own agents. "Hire an AI teammate" is marketing language for *meeting Atlas*, never a feature.
- **Bring your own key (BYOK).** Users supply their LLM key → near-zero COGS → high margin. Managed "Atlas Cloud" exists for those who'd rather pay per use.
- **Open source as funnel.** AGPL forces the code open; the moat is hosting + Atlas Cloud + brand + execution, **not** code secrecy. We compete on trust, polish, and the agent — not on hiding source.

## 1.3 Jobs-to-be-done

**Primary job:**
> *When I have work and ideas scattered everywhere and not enough hands, I want a simple workspace with one capable AI teammate that actually does the busywork, so I can move faster and focus on what only I can do — without hiring people or wrestling with bloated tools.*

**By ICP:**
- **AI-forward teams:** *the AI should be embedded in the tracker doing real tasks (with my approval), not in a disconnected chat window.*
- **Privacy / self-host teams:** *I want AI leverage without giving up control of my data or costs.*
- **Creators / beginners (TikTok audience):** *I want the AI magic without the learning curve — one workspace, one AI that "just does it."*

**Emotional/social job:** *I want to feel — and look — like someone who has it together and works with the future.*

## 1.4 ICPs

1. **AI-forward startups / small teams (5–50).** Primary revenue. Want Atlas doing triage, drafting, grooming inside the tracker.
2. **Privacy / self-host teams.** Need self-host + BYOK; pay for support / managed instances.
3. **AI-curious creators, beginners, builders.** Top-of-funnel volume + evangelism via the founder's TikTok (@rengi.mp4). Low ACV, high distribution value.

## 1.5 Business model & pricing

Three lanes:
- **Open source (self-host, free):** full product, AGPL. Funnel + trust.
- **DragonFruit Cloud (hosted SaaS):** primary revenue, per seat. BYOK keeps COGS near zero.
- **Atlas Cloud (managed LLM metering):** usage upside for users who don't want BYOK.

| Plan | Price (illustrative) | Includes |
|---|---|---|
| **Free** | $0 | 1 user, tasks + docs, **no Atlas** |
| **Pro** | ~$10–12 / user / mo | Unlimited members, **full Atlas** (automations, MCP connectors, memory, multi-step tool use), mac app, integrations, priority support |
| **Business** | ~$20–24 / user / mo | + SSO/SAML, audit logs, SLA |
| **Atlas Cloud** | usage (cost × ~1.3–1.5 markup) | Managed LLM — no key to manage; metered per token |

**COGS note:** Cost of Goods Sold = direct cost to serve a customer. With BYOK, the user pays inference, so COGS ≈ hosting only → ~85–90%+ gross margin.

## 1.6 Moat / stickiness (lock-in)

- **Data gravity** — tasks + docs + history accumulate; switching cost rises.
- **Atlas memory** — Atlas learns the team's context (`AgentMemory` exists in schema). A team that's trained Atlas won't restart elsewhere. *Strongest moat.*
- **Integrations / MCP connectors** — every connected tool ties them in.
- **Surface ubiquity** — web + mac menu-bar app + mobile + Chrome extension.
- **Automations** — once their workflow lives in DragonFruit, the tool is their process.

## 1.7 Go-to-market

- **OSS-led PLG:** self-host repo + one-click deploy → GitHub stars → "upgrade to Cloud to skip ops."
- **Lead with Atlas, not "Plane fork."** Demo a result, not a chatbot.
- **TikTok engine (@rengi.mp4):** free CAC. See content plan §1.9.
- **Communities:** HN / r/selfhosted / Lobsters — where AGPL + self-host + BYOK is a feature.

## 1.8 Positioning copy (single source — keep these in sync)

**Homepage headline:**
> **Your workspace, plus one AI teammate who actually does the work.**
> Tasks and docs, kept simple. Meet Atlas — he organizes, drafts, and triages, and asks before anything risky. Open-source. Bring your own AI key.

**Alternates:** *Hand off the busywork. Keep the credit.* / *A calm workspace with a brilliant AI teammate built in.* / *Notion-simple. With Jarvis.*

**TikTok hook (spoken, first 3s):** *"I gave my to-do list an AI teammate — watch it do my actual work."*

**Universal end-card CTA:** *Open-source. Self-hostable. Bring your own AI key. Link in bio.*

## 1.9 TikTok content plan (@rengi.mp4)

Unified hook formula: *"I gave my [X] an AI teammate — watch it [do the work]."* Keep Atlas as one recurring character.

**Series A — "Watch Atlas do it" (conversion):**
1. Brain-dump → organized week (FLAGSHIP, pin this)
2. "Draft the doc" → full doc appears in comments
3. The approval moment (trust beat)
4. Triage 30 messy tasks in seconds
5. Overnight teammate (mac menu-bar app finished while you slept)
6. Meeting notes → tasks

**Series B — "Why this is different" (positioning):**
7. "I don't pay per AI message" (BYOK)
8. "Self-hosted, so it's mine" (privacy)
9. "Open-source Notion + AI"
10. "It's free for one person"

**Series C — "Build in public" (loyalty):**
11. "I forked a $100M tool and added AI"
12. Day in the life building DragonFruit (using Atlas to build Atlas)
13. "I shipped this with my AI teammate's help"
14. Milestone reactions (first customer, 1000 stars)

**Series D — "Productivity, generally" (reach):**
15. "My system for never losing an idea"
16. "5 things I stopped doing manually"
17. "How I plan my week in 4 minutes"

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
Server-side enforcement that Free = solo tasks + docs (no Atlas) and Pro+ = full Atlas, so the paywall is real and tamper-resistant.

### Functional requirements
1. A single authority `plan_allows(workspace, feature) -> bool`, sourced from `WorkspaceSubscription`.
2. Gated features: `atlas` (all agent endpoints), `automations`, `mcp_connectors`, `sso`, `audit_logs`.
3. Enforcement is **server-side** on the relevant API endpoints (not just hidden in UI).
4. UI reads the same plan state to show upgrade prompts / paywalls on gated surfaces.
5. Free tier: hard-block adding a 2nd human member (1 user).

### Acceptance criteria
- [ ] Atlas endpoints return a clear "upgrade required" error on Free.
- [ ] UI shows an upgrade CTA instead of the gated feature on Free.
- [ ] Downgrading from Pro disables Atlas immediately at period end.
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

### Open question (verify before building Part 3)
Does Atlas's tool set include **project/task creation**? Confirmed tools today: `change_state`, `post_comment`, `search_issues`, `list_attachments`, `plan_next_steps`, `record_step`. If `create_issue` / `create_project` are **not** exposed, Part 3's "let Atlas build the project" requires adding those tools first — otherwise the project is created manually from Part 3.

---

# PART 3 — EXECUTION PLAN (Atlas-ingestible)

> **For Atlas (or manual setup):** create a project **"DragonFruit: Path to Revenue."** Each `## Module` is a Module (epic); each `- [ ]` is a Task with the given labels, priority, and assignee. Sequence with `phase-1/2/3` labels (this workspace has no cycles by design). Assign "Atlas" tasks to yourself.

**Labels to create:** `monetization`, `atlas-cloud`, `gtm`, `content`, `legal`, `product`, `infra`, `quick-win`, `blocker`, `phase-1`, `phase-2`, `phase-3`.

## Module: MON — Billing & Monetization (implements PRD-1, PRD-2)
- [ ] **Set up Stripe account + products/prices** (Free/Pro/Business) — `monetization` `blocker` `phase-1` — Human
- [ ] **Design `WorkspaceSubscription` model** in a new `billing/` app — `monetization` `product` `phase-1` — Human
- [ ] **Stripe Checkout + Billing Portal integration** — `monetization` `phase-1` — Human
- [ ] **Idempotent Stripe webhook handler** — `monetization` `blocker` `phase-1` — Human
- [ ] **`plan_allows()` feature-gating; Free = no Atlas** — `monetization` `product` `blocker` `phase-2` — Human
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
- [ ] **Verify Atlas has create_issue/create_project tools** (see PRD-4 open question) — `product` `blocker` `phase-1` — Human
- [ ] **Atlas: write canonical Atlas intro + capability copy** — `content` `product` `quick-win` `phase-1` — Atlas

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
