# DragonFruit — ICP Research & Profiles

> Who we sell to, what job they're hiring us for, and what each of them needs to hear.
> Companion docs: [02-brand-story.md](02-brand-story.md) (narrative system) · [03-landing-ux-spec.md](03-landing-ux-spec.md) (landing implementation).
> Extends `DRAGONFRUIT_SOURCE_OF_TRUTH.md` §1.3–1.4. Written 2026-07-11.

## Method

Desk research (sources linked inline) + the strategy already locked in the SOT (BYOK economics, one-Atlas principle, tasks+docs+sheets scope). Everything here should be pressure-tested against the validation plan at the bottom — these are **hypotheses with evidence**, not settled truth.

## Market context — the five facts that shape our ICPs

1. **SMB AI adoption is wide but shallow.** ~55% of small businesses used AI in 2025 (up from 39% in 2024), but only ~17.7% have **paid** for an AI tool ([JPMC Institute](https://www.jpmorganchase.com/institute/all-topics/business-growth-and-entrepreneurship/understanding-ai-use-by-small-businesses), [Capsule](https://capsulecrm.com/blog/small-business-ai-adoption-statistics/)). The money is in closing the try→pay gap: people who already believe in AI but haven't found a tool worth paying for.
2. **Young companies adopt fastest.** The 2025 startup cohort reached 10% AI adoption in six months — the 2019 cohort took six years ([JPMC](https://www.jpmorganchase.com/institute/all-topics/business-growth-and-entrepreneurship/understanding-ai-use-by-small-businesses)). Our primary ICP is _new teams choosing their first real stack_, not teams migrating off entrenched tools.
3. **Trust is the blocker for agents.** 62% of workers are concerned about AI agents' trustworthiness, and "human oversight for high-impact decisions" is the single most-cited trust requirement; agent usage at work still jumped 31%→59% in a year ([McKinsey](https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/tech-forward/state-of-ai-trust-in-2026-shifting-to-the-agentic-era), [AvePoint](https://www.avepoint.com/blog/manage/state-of-ai-2026-report)). **Our approval gate is not a feature — it's the answer to the market's #1 objection.**
4. **AI pricing creep is real and resented.** Notion now locks AI behind its $20 Business tier; ClickUp charges $7 + $9 (Brain) to $28 (Everything AI) per user on top ([Notion pricing](https://get-alfred.ai/blog/notion-pricing), [ClickUp pricing](https://www.eesel.ai/blog/clickup-pricing)). DragonFruit Pro at ~$12 with **full Atlas included + BYOK** is a visible wedge.
5. **Self-hosting is surging, driven by AI data fears.** r/selfhosted ≈ 798k members (+244k in one year) ([subreddit stats](https://subredditstats.com/r/selfhosted)); the drivers are AI-training-on-my-data fear, compliance, and subscription fatigue ([DEV](https://dev.to/sst21/self-hosting-in-2026-why-it-matters-and-how-to-get-started-233d)). Upstream proof: Plane CE has ~50k GitHub stars and 1M+ Docker pulls ([makeplane/plane](https://github.com/makeplane/plane)) — demand for OSS PM is proven; nobody has paired it with a trustworthy built-in teammate.

## ICP index

| #   | Name                        | Who                                           | Plan fit                               | Funnel role             | Priority        |
| --- | --------------------------- | --------------------------------------------- | -------------------------------------- | ----------------------- | --------------- |
| 1   | **The Lean Builders**       | AI-forward startups & small teams, 2–50 seats | Pro → Business                         | **Primary revenue**     | P0              |
| 2   | **The Sovereign Operators** | Privacy-first / self-host teams & homelabbers | Free self-host → support/managed later | Trust, evangelism, moat | P1              |
| 3   | **The One-Person Studios**  | Creators, solopreneurs, indie builders        | Free → Pro (1 seat)                    | Distribution & volume   | P1 (via TikTok) |

---

## ICP 1 — The Lean Builders (primary revenue)

**Who.** Startups and small product/ops teams, 2–50 people, founded recently, default-to-AI culture. Champion: founder, COO/ops lead, or the engineer who owns "tools." Decision cycle: days, one person can swipe a card.

**Current stack.** Notion (docs) + Linear/ClickUp/Trello (tasks) + ChatGPT/Claude in a separate tab + a spreadsheet for the budget. Context lives in four places; the AI sees none of it.

**Job-to-be-done.** _"When work and ideas pile up faster than my team can process them, give me one workspace where an AI teammate actually does the busywork — triage, drafts, summaries — so we ship without hiring an admin layer."_

**Pains (ranked).**

1. Context scattered across tools; every handoff is re-explaining (the villain: the gap between idea and work).
2. AI is disconnected from the tracker — copy-paste in, copy-paste out.
3. AI seat pricing creep: paying $16–48/user across tools for AI that still doesn't know the project.
4. Tool sprawl guilt: 5+ subscriptions, none loved.

**Buying trigger.** Team hits ~5–10 people and coordination pain arrives; or the quarterly software-spend review flags the AI add-ons; or they watch a demo of Atlas triaging a real backlog.

**Objections → answers.**
| Objection | Answer (and where it lives) |
|---|---|
| "Can I trust an agent in my tracker?" | Approval gate — Atlas drafts, you approve (hero badge, Atlas section, demo clip #3) |
| "Migration is a quarter of pain" | One-afternoon import, Trello/Asana/Notion mappings (Switching section) |
| "Another AI subscription?" | BYOK: pay your provider, not our markup; Pro includes Atlas (Pricing) |
| "What if you die / rug-pull?" | AGPL, self-hostable, your data exports (Open source section) |

**What success looks like for them.** Atlas triages the inbox before standup; the founder brain-dumps on Friday and finds an organized week on Monday; software line item goes down.

**Message that lands:** _"Hand off the busywork. Keep the credit."_ / _"Where ideas become work."_
**Channels:** HN/Show HN, X/Twitter build-in-public, Product Hunt, r/startups, comparison SEO ("Notion AI alternative", "ClickUp Brain too expensive").

---

## ICP 2 — The Sovereign Operators (trust & evangelism)

**Who.** Self-hosters, privacy-conscious teams, EU/regulated SMBs, homelabbers with a work agenda. The r/selfhosted crowd (798k, growing ~30%/yr) and the lobste.rs/HN "show me the compose file" reader. Often the same person as ICP 1's tools-owner engineer — this is a _mindset_, not only a segment.

**Job-to-be-done.** _"Give me AI leverage without giving up my data, my keys, or my cost control."_ Their nightmare is SaaS training models on their internal docs; their key question is "where does my prompt go?"

**Why we win.** BYOK + self-host is the whole answer: their infra, their provider key, their audit trail. AGPL means the code can't be taken closed. Sheets/docs/tasks in one deploy replaces three containers.

**Pains.** SaaS AI = data exfiltration by default; per-message AI pricing; compose files that break on upgrade; "open core" bait-and-switch resentment.

**Objections → answers.** Docker/compose quality and upgrade story (docs + one-click deploy); "is AGPL real or marketing?" (footer attribution, public repo); "what's paid?" (clear line: Cloud hosting + Atlas Cloud metering are paid; the product is not).

**What success looks like.** Running DragonFruit next to their other services; Atlas on their own Anthropic/OpenAI key; posting their setup on r/selfhosted.

**Message that lands:** _"Your workspace, your keys, your data."_ + visible BYOK math.
**Channels:** r/selfhosted, awesome-selfhosted list, HN, lobste.rs, self-host YouTube (DB Tech, Awesome Open Source). Revenue is indirect (support/managed instances later) — their job in the model is **trust halo + distribution**.

---

## ICP 3 — The One-Person Studios (volume & distribution)

**Who.** Creators, solopreneurs, indie hackers. 29.8M US solopreneurs generating $1.7T; solo-founded startups grew 23.7%→36.3% since 2019; **74% already use AI**; typical tool budget $75–150/mo; 41% say time is their #1 constraint ([solopreneur stats](https://founderreports.com/solopreneur-statistics/), [Crevio](https://crevio.co/blog/solopreneur-statistics), [AutoFaceless](https://autofaceless.ai/blog/solopreneur-statistics-2026)). They arrive from TikTok/@rengi.mp4, not from a procurement process.

**Job-to-be-done.** _"Be my second pair of hands: catch every idea, turn it into a plan, and keep me shipping — without me learning a PM methodology."_ The emotional job from the SOT is loudest here: _feel — and look — like someone who has it together._

**Pains.** Idea capture is everywhere (notes app, voice memos, DMs); consistency collapses under context-switching; PM tools feel like homework built for teams they don't have.

**Objections → answers.** "Another tool to learn" → the demo IS the onboarding (brain-dump → organized week in 45s); "AI plans feel generic" → Atlas reads _their_ whole workspace; "price" → free solo tier, Pro only when Atlas earns it.

**What success looks like.** Sunday brain-dump becomes a Monday plan; captured chats from Claude/ChatGPT land as docs; they post about it (this ICP is also our content flywheel).

**Message that lands:** _"I gave my to-do list an AI teammate — watch it do my actual work."_ (hook) → _"Where ideas become work."_ (landing echo).
**Channels:** TikTok series A/D, IG Reels, YT Shorts, indie-hacker X. KPI is hook CTR → signup, not ACV.

---

## Anti-ICPs (say no on purpose)

- **Enterprise PMOs & sprint-heavy eng orgs** — they want cycles, Gantt, portfolio roll-ups, SOC2, SSO-first. We deleted the sprint machinery deliberately; Business tier may court their smaller cousins later.
- **Compliance-led procurement buyers** — until SSO/SAML + audit logs ship (SOT phase-3), don't chase.
- **Spreadsheet-power finance teams** — Sheets are lightweight by design; don't promise Excel.
- **Agencies needing granular client permissions** — real need, not v1.

## Prioritization logic

One product, three doors: **ICP 1 pays, ICP 3 spreads, ICP 2 vouches.** The landing leads with 1, the TikTok engine feeds 3, the open-source story keeps 2 loud in comments. All three hear the same story (see [02-brand-story.md](02-brand-story.md)) with different emphasis — never three different stories.

## Validation plan (next 60 days)

1. **10 interviews per ICP** — recruit from TikTok DMs (ICP3), HN/Show HN comments (ICP1/2), r/selfhosted (ICP2). Score pains against the ranked lists above; revise. **Scripts, scoring rubric, and recruiting templates: [04-icp-interview-scripts.md](04-icp-interview-scripts.md).**
2. **Hook tests** — run Series A vs B clips; measure hook CTR and landing conversion by referrer. Hypothesis: ICP3 converts on the flagship brain-dump clip; ICP1 on the approval-moment clip.
3. **Landing telemetry** — per-section scroll depth + CTA clicks segmented by referrer (see measurement plan in [03-landing-ux-spec.md](03-landing-ux-spec.md)).
4. **Pricing sniff test** — Van Westendorp lite (4 questions) to 30 signups; validate $12/$24 vs the Notion-$20 / ClickUp-$16-effective anchors.
5. **Show HN / r/selfhosted launch posts** — count "how do I deploy" vs "how much" vs "agent trust" questions; that ratio tells us which ICP the OSS story actually pulls.
