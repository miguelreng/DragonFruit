# DragonFruit — Brand Story System (StoryBrand SB7)

> The one narrative every surface tells — landing, app, TikTok, docs, pricing page.
> Companion docs: [01-icp-profiles.md](01-icp-profiles.md) (who hears it) · [03-landing-ux-spec.md](03-landing-ux-spec.md) (where it renders).
> Canonical copy lives in `DRAGONFRUIT_SOURCE_OF_TRUTH.md` §1.8 — when this file and §1.8 disagree, fix §1.8 first, then downstream. Written 2026-07-11.

## Framework choice

**StoryBrand (SB7)** for the narrative — it forces the customer (not the product) to be the hero, which matches our biggest risk: AI products love talking about their own intelligence. **April Dunford's positioning** feeds the inputs (alternatives → unique attributes → value → who cares). One framework for _what the story is_, one for _why it wins_.

## Positioning inputs (Dunford)

| Step                     | Answer                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Competitive alternatives | Notion + AI locked in $20 Business tier · ClickUp + $9–28 Brain add-ons · Linear (no self-host, no docs-first) · Plane CE (no teammate) · "Notion + ChatGPT tab + spreadsheet" duct tape |
| Unique attributes        | One **fixed** AI teammate with an **approval gate** · tasks + docs + sheets and nothing else · **BYOK** · AGPL self-hostable · one-afternoon imports · Atlas memory of the workspace     |
| Value themes             | 1) Calm simplicity (no sprint machinery) 2) Trusted delegation (drafts, never rogue) 3) Ownership (your data, your keys, your costs)                                                     |
| Who cares most           | The three ICPs — Lean Builders, Sovereign Operators, One-Person Studios                                                                                                                  |
| Category frame           | **The calm AI workspace.** (A workspace with a teammate inside — _not_ "project management with AI features," _not_ "an agent platform.")                                                |

## The BrandScript (SB7)

**1 · Character (the hero — never Atlas, never us).**
A builder with more ideas than hands — founder, small team lead, or one-person studio. They want to **ship what they imagine** without drowning in the admin between.

**2 · Problem.**

- **Villain:** _the gap between idea and work_ — the translation tax of turning thoughts into tickets, briefs, and follow-ups.
- External: context scattered across five tools; AI that starts from a blank prompt.
- Internal: feeling behind on their own ambitions; guilt about the idea backlog; "I look less together than I am."
- Philosophical: busywork should be done _for_ you; **decisions should stay yours.**

**3 · Guide (DragonFruit + Atlas).**

- Empathy: we're builders; we hated re-explaining context to tools too.
- Authority: real product, open source under AGPL (inspectable, self-hostable — trust you can verify, standing on the most-starred OSS PM core on GitHub); Atlas asks before anything risky — by design, not disclaimer.
- Voice note: **Atlas is the guide's instrument, not the hero.** Demos show _the user's_ work getting done.

**4 · Plan (three steps, everywhere).**

1. **Bring the mess** — notes, meetings, boards from Trello/Asana/Notion, half-ideas.
2. **Atlas drafts** — tasks, briefs, sheets, triage, next steps, with the whole project in view.
3. **You approve & ship** — nothing risky moves without your yes.

**5 · Call to action.**

- Direct: **Start free** (always the same words, always magenta).
- Transitional: watch the 45s demo · self-host it · follow the build (@rengi.mp4).

**6 · Failure (the stakes — use sparingly, one beat per surface).**
Ideas rot in tabs. Momentum dies in handoffs. You hire admin you can't afford — or become it.

**7 · Success (the transformation).**
Friday brain-dump → Monday plan. The backlog triages itself before standup. Work ships; **you keep the credit**; the room stays calm.
Identity shift: _scattered idea-haver → calm shipper._

## The one-liner (SB7 formula: problem → solution → success)

> "Most ideas die in the gap between thinking and doing. DragonFruit is the calm workspace where Atlas — your AI teammate — walks them to done, with your approval."

## Canonical lines and where they live

| Line                                                         | Surface                                               |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| **Where ideas become work.**                                 | Landing H1 · app login tagline (identical on purpose) |
| Atlas™ drafts. You approve.                                  | Landing hero badge · approval-card UX copy            |
| From idea to work, calmly.                                   | Narrative frame — section copy, bios, descriptions    |
| Hand off the busywork. Keep the credit.                      | Atlas section H2 · ads/end-cards                      |
| "I gave my [X] an AI teammate — watch it do my actual work." | TikTok hook (SOT §1.9)                                |
| Open-source. Self-hostable. Bring your own AI key.           | Universal end-card + final CTA sub                    |

## One story, three emphases (messaging matrix)

| SB7 beat            | ICP 1 · Lean Builders                 | ICP 2 · Sovereign Operators       | ICP 3 · One-Person Studios            |
| ------------------- | ------------------------------------- | --------------------------------- | ------------------------------------- |
| Villain             | Context scattered across tools        | Data leaving your hands           | Ideas outrunning your hours           |
| Guide proof         | Approval gate + whole-project context | AGPL + BYOK + self-host           | The 45s demo itself                   |
| Plan step to stress | Atlas drafts (triage, briefs)         | Bring the mess (to _your_ server) | You approve & ship (it's still _you_) |
| Success             | Team ships w/o admin layer            | Leverage without surrender        | "I look like I have it together"      |
| CTA flavor          | Start free → invite team              | Deploy the compose file           | Start free → first brain-dump         |

## Voice & vocabulary

**Voice:** calm, concrete, first-person-plural sparingly. Contractions on. Short declaratives. Numbers over adjectives. One metaphor per section, maximum.

**Say:** teammate · calm · approve / your yes · busywork · brain-dump · drafts · ship · workspace · your keys.
**Never:** copilot, agent (in marketing copy), AI-powered, supercharge, 10x, revolutionize, seamless, magic (as a claim), blazing, unleash, game-changer.
**Rules:** Atlas is _he_ (fixed identity, SOT §PRD-4) and does verbs, not miracles — Atlas _drafts, triages, organizes, asks_; he never _transforms, revolutionizes, empowers_. ™ on first prominent DragonFruit/Atlas mention per page + footer. "Sheets," "Docs," "Tasks" are capitalized product nouns; generic usage stays lowercase.

## Anti-narratives (stories we refuse to tell)

- "AI will do everything" — breaks the approval-trust beat (62% of workers distrust agents; our story is _why we're different_).
- "Powerful enough for enterprise" — feeds the machinery villain we exist to kill.
- "Fork of Plane" as the lead — attribution lives honestly in the footer; the story leads with Atlas (SOT §1.7).
- Feature-listing without the villain — features only appear as answers to a named pain.
