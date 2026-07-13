# DragonFruit — ICP Interview Scripts

> Validation plan item #1 from [01-icp-profiles.md](01-icp-profiles.md): 10 interviews per ICP.
> Goal: confirm (or kill) the ranked pains before spending on paid acquisition. Written 2026-07-11.

## Ground rules (Mom Test discipline)

1. **Talk about their life, not our product.** The product appears only in the last 5 minutes, if at all.
2. **Past behavior beats hypotheticals.** Every "would you…?" gets replaced with "tell me about the last time…".
3. **Compliments are worthless; specifics and money are signal.** "Cool idea" = zero. "I paid $19/mo for a worse version" = gold. "Can I use it today?" = jackpot.
4. Listen ratio ≥ 80/20. Silence after answers — the second sentence is where the truth lives.
5. Log verbatims, not summaries. The exact words become landing copy.

**Logistics.** 25–30 min video call (or async voice for TikTok recruits). Ask consent to record. Incentive: 3 months of Pro at launch or a $25 gift card. Book via a plain Cal link. One interviewer + notes doc per session (template at bottom).

**Recruiting sources.** ICP 1: HN "Show HN" commenters, X build-in-public replies, YC/startup Slack/Discords. ICP 2: r/selfhosted, lobste.rs, awesome-selfhosted issue participants. ICP 3: @rengi.mp4 DMs and commenters, indie-hacker X.

---

## Shared warm-up (all ICPs, ~3 min)

- W1. "What do you work on, and who else touches that work day to day?"
- W2. "Walk me through the tools you had open yesterday for actual work — just the honest list."

---

## ICP 1 — The Lean Builders (teams 2–50)

| #   | Question                                                                                                                  | Validates (pain/hypothesis)                 | Listen for / red flags                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | "Tell me about the last time something fell through the cracks between your tools. What happened?"                        | Pain 1: scattered context                   | Named incident with cost = strong. "Doesn't really happen" = fit risk. |
| 2   | "When a messy idea or meeting needs to become tasks — who does that translation, and how long does it take?"              | The villain (translation tax)               | A named person burning hours weekly = strong.                          |
| 3   | "How does AI show up in your team's week right now? Show me if you can."                                                  | Pain 2: AI disconnected from tracker        | Copy-paste between ChatGPT and tracker = exactly our wedge.            |
| 4   | "What's your monthly software spend per person, roughly? Which line items annoy you?"                                     | Pain 3: AI pricing creep                    | Unprompted mention of Notion AI / ClickUp Brain pricing = strong.      |
| 5   | "Have you tried letting AI change things in your tracker or docs automatically? How did that go — and where's your line?" | Approval-gate hypothesis                    | "I'd want to review first" verbatim = badge copy validated.            |
| 6   | "What happened the last time you switched a core tool? What almost stopped you?"                                          | Switching-section objection                 | Migration horror stories → import story resonance.                     |
| 7   | "If your team doubled tomorrow, what breaks first in how you organize work?"                                              | Buying trigger (5–10 person wall)           | Coordination named before headcount = trigger confirmed.               |
| 8   | "Who decides on a new $12/user tool at your size — and what would they ask you?"                                          | Buying motion (card-swipe hypothesis)       | Committee/procurement = wrong segment for now.                         |
| 9   | "What have you already tried to fix any of this? What did you abandon, and why?"                                          | Competitive alternatives (Dunford)          | Abandoned Notion-AI/ClickUp = prime prospect.                          |
| 10  | "Magic wand: one kind of busywork disappears forever. Which one?"                                                         | Ranks our verb set (triage/draft/summarize) | Answers outside our verbs = scope gap to note.                         |

---

## ICP 2 — The Sovereign Operators (self-host / privacy)

| #   | Question                                                                                                                                | Validates                           | Listen for / red flags                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| 1   | "What do you self-host today, and what was the last thing you added?"                                                                   | Segment reality check               | Active homelab/prod stack = fit. Aspirational only = weak.         |
| 2   | "In your own words — why self-host instead of SaaS?"                                                                                    | Sovereignty motive ranking          | "AI training on my data" unprompted = our exact story.             |
| 3   | "How do you use AI tools today, and where's your personal line on what data goes to them?"                                              | AI-leverage-without-surrender JTBD  | Uses local models or API keys directly = BYOK-ready.               |
| 4   | "Do you already have provider API keys (Anthropic/OpenAI)? What do you run on them?"                                                    | BYOK friction hypothesis            | Has keys = zero-friction adopter. No keys = Atlas Cloud candidate. |
| 5   | "Tell me about a self-hosted app you deployed and then removed. What killed it?"                                                        | Adoption/retention criteria         | Upgrade pain, bad compose, abandoned repo — our checklist.         |
| 6   | "What do you check before deploying something new — repo, docs, community? Walk me through your ritual."                                | Distribution requirements           | Stars/license/compose quality — informs /self-host page.           |
| 7   | "Does AGPL vs MIT vs 'open core' change your decision? How?"                                                                            | License-as-trust hypothesis         | Strong opinions = evangelist potential.                            |
| 8   | "Do you run anything self-hosted for work, not just home? How did that cross over?"                                                     | Homelab→work pipeline               | Work crossover = revenue path exists.                              |
| 9   | "Have you ever paid for support, a managed instance, or a license for OSS? What made it worth it?"                                      | Monetization path (support/managed) | Prior OSS spending = ICP 2 revenue is real, not theoretical.       |
| 10  | "If a tasks+docs+sheets workspace with a built-in AI teammate existed self-hosted with your own key — what would make you distrust it?" | Objection harvest                   | Their words become the FAQ.                                        |

---

## ICP 3 — The One-Person Studios (creators / solopreneurs)

| #   | Question                                                                                                       | Validates                                              | Listen for / red flags                                       |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| 1   | "Where did your last three ideas land — like literally, which app or surface?"                                 | Capture chaos (pain 1)                                 | Notes app + voice memos + DMs sprawl = fit.                  |
| 2   | "Tell me about an idea from last month that never went anywhere. What happened to it?"                         | The villain, personally felt                           | Guilt language = internal problem confirmed (SB7).           |
| 3   | "Walk me through yesterday: how much time went to the work vs organizing the work?"                            | 41% time-constraint stat, locally                      | Ratio + frustration verbatims.                               |
| 4   | "Which AI tools do you actually pay for right now, and how much is that a month?"                              | $75–150/mo budget hypothesis                           | Real spend = willingness to pay exists.                      |
| 5   | "Have you tried a project tool like Notion, Trello, or ClickUp solo? How long did it last, and what ended it?" | PM-tools-feel-like-homework pain                       | "Set it up, abandoned in 3 weeks" = our onboarding brief.    |
| 6   | "When AI writes a plan or draft for you, what makes you keep it vs throw it away?"                             | Context-quality hypothesis (Atlas reads the workspace) | "It's generic" = exactly the blank-prompt villain.           |
| 7   | "What would 'having it together' look like for you on a Monday morning?"                                       | Emotional/identity job (SOT)                           | Their image = end-card visuals for TikTok.                   |
| 8   | _(Show the 45s brain-dump demo.)_ "Talk me through what you just saw — what would you do first with it?"       | Demo-as-onboarding hypothesis                          | "Can I try it now?" = jackpot. Polite nodding = weak.        |
| 9   | "At what monthly price would that stop being worth it for you?" (then the reverse: "so cheap you'd doubt it?") | Van Westendorp lite                                    | Compare to $12 anchor.                                       |
| 10  | "If it worked the way the demo showed, who would you show it to — and would you post about it?"                | Flywheel hypothesis (ICP 3 spreads)                    | Names a specific audience/platform = distribution confirmed. |

---

## Pricing probes (append to any interview where pain confirmed, 2 min)

1. "At what price per person per month would this feel expensive but worth it?"
2. "At what price would it feel so cheap you'd question the quality?"
3. "What do you pay today for the things it would replace?"
4. (Teams) "Seats included vs pay-per-AI-message — which do you trust more, and why?"

## Scoring rubric (fill within 10 min of each call)

| Field                                            | Scale                                                                       | Notes                          |
| ------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------ |
| Pain 1 / 2 / 3 intensity (per ICP's ranked list) | 0 none · 1 mentioned · 2 has cost · 3 tried to fix it                       | "Tried to fix" is the only 3   |
| Money signal                                     | current spend on adjacent tools, $                                          | verbatim                       |
| Pull                                             | 0 polite · 1 asked follow-ups · 2 asked for access · 3 offered to pay/pilot |                                |
| Approval-gate reaction                           | verbatim                                                                    | badge copy source              |
| Segment fit                                      | 1–5 vs ICP definition                                                       | recruit better next time if <3 |
| Best verbatim                                    | quote                                                                       | future landing copy            |

**Decision rules after 10 interviews per ICP:**

- ≥6/10 score pain #1 at 2+ → pain confirmed, proceed on that ICP's channel plan.
- ≥3 "pull = 2+" → open a private pilot list for that ICP immediately.
- <4/10 confirm pain #1 → revise the ICP's pain ranking in [01-icp-profiles.md](01-icp-profiles.md) before spending on it.
- Any question that produces blank stares twice gets rewritten — the script serves the signal, not the other way around.

## Recruiting templates

**TikTok DM (ICP 3):** "Hey — building the AI-teammate workspace from my videos. Doing 25-min calls with creators about how they keep ideas moving. No pitch, just questions; you get 3 months of Pro at launch. Interested?"

**HN / X reply (ICP 1):** "We're researching how small teams connect AI to their actual tracker (not a sales call — 25 min, your workflow, our questions). Happy to share the anonymized findings back."

**r/selfhosted post (ICP 2):** "Building an AGPL tasks+docs workspace with a built-in AI teammate (BYOK). Before we ship the self-host story we want to hear how you evaluate new services for your stack — 25 min, no pitch, findings posted back to this sub."

## Synthesis cadence

After every 5 interviews: 30-min pass to update the scoring sheet and pull the top verbatims into [02-brand-story.md](02-brand-story.md) candidates. After 10: apply decision rules, update [01-icp-profiles.md](01-icp-profiles.md), and adjust the landing test backlog in [03-landing-ux-spec.md](03-landing-ux-spec.md).
