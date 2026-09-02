# DragonFruit — Brand Story System (StoryBrand SB7)

> The one narrative every surface tells — landing, app, TikTok, docs, pricing page.
> Companion docs: [01-icp-profiles.md](01-icp-profiles.md) (who hears it) · [03-landing-ux-spec.md](03-landing-ux-spec.md) (where it renders).
> Strategic proposal: [../strategy/ai-native-story-and-business-proposal.md](../strategy/ai-native-story-and-business-proposal.md).
> Canonical copy lives in `DRAGONFRUIT_SOURCE_OF_TRUTH.md` §1.8 — when this file and §1.8 disagree, fix §1.8 first, then downstream. Written 2026-07-11.

## Framework choice

**StoryBrand (SB7)** for the narrative — it forces the customer (not the product) to be the hero, which matches our biggest risk: AI products love talking about their own intelligence. **April Dunford's positioning** feeds the inputs (alternatives → unique attributes → value → who cares). One framework for _what the story is_, one for _why it wins_.

## Positioning inputs (Dunford)

| Step                     | Answer                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Competitive alternatives | Work scattered across a task app, a docs app, meetings, somebody's head, and a separate general AI that starts from zero; plus Notion/ClickUp/Linear/Plane alternatives |
| Unique attributes        | One **fixed** AI teammate with an **approval gate** · visible Workspace/Project Brief context · external AI access through MCP · tasks + docs + sheets · **BYOK** · AGPL self-hostable |
| Value themes             | 1) Calm home (work stays together) 2) Continuity (context survives tools and sessions) 3) Trusted follow-through (draft, approve, execute, report) 4) Ownership |
| Who cares most           | Lean Builders first; Sovereign Operators and One-Person Studios remain distribution/trust doors                                                                 |
| Category frame           | **The calm home for work that remembers.** Internally: an AI-native system of record/control plane. Never lead the homepage with that technical language.                                   |

## The BrandScript (SB7)

**1 · Character (the hero — never Atlas, never us).**
A builder with more ideas than hands — founder, small team lead, or one-person studio. They want to **ship what they imagine** without drowning in the admin between.

**2 · Problem.**

- **Villain:** _context decay_ — meaning disappears as an idea moves between a chat, meeting, Doc, Task, and follow-up.
- External: context scattered across tools; every AI/session starts from a partial prompt; generated plans still need manual execution.
- Internal: feeling behind on their own ambitions; guilt about the idea backlog; "I look less together than I am."
- Philosophical: work should remember what the team already knows; busywork should be done _for_ you; **decisions should stay yours.**

**3 · Guide (DragonFruit + Atlas).**

- Empathy: we're builders; we hated re-explaining context to tools too.
- Authority: real product, open source under AGPL (inspectable and self-hostable); visible Brief context; BYOK; Atlas asks before anything risky; the same canonical workspace can serve native and authorized external AI surfaces.
- Voice note: **Atlas is the guide's instrument, not the hero.** Demos show _the user's_ work getting done.

**4 · Plan (three steps, everywhere).**

1. **Start anywhere** — bring a note, meeting, prompt, existing board, or half-idea from the surface already open.
2. **Keep the context** — DragonFruit connects the idea to the relevant Brief, Docs, Tasks, decisions, and history.
3. **Move it forward** — Atlas drafts, follows up, and executes within the permissions you approve.

**5 · Call to action.**

- Direct: **Start free** (always the same words, always magenta).
- Transitional: watch the 45s demo · self-host it · follow the build (@rengi.mp4).

**6 · Failure (the stakes — use sparingly, one beat per surface).**
Context disappears between tools. Plans become abandoned Docs. Momentum dies in follow-ups. You hire admin you cannot afford—or become it.

**7 · Success (the transformation).**
Friday brain-dump → Monday plan → approved work → Friday report. The project remembers decisions, survives a change of AI interface, and keeps moving; **you keep the judgment and the credit**; the room stays calm.
Identity shift: _scattered idea-haver → calm shipper._

## The one-liner (SB7 formula: problem → solution → success)

> "DragonFruit is a quiet place where ideas become work—your context stays together, and Atlas helps move it forward with your approval."

## Canonical lines and where they live

| Line                                                         | Surface                                               |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| **A quiet place where ideas become work.**                   | Landing H1                                            |
| Start anywhere. Your context stays here.                     | Landing eyebrow · external-AI section                  |
| A quiet place where your work keeps its context.             | Brand promise · descriptions                           |
| Atlas™ drafts. You approve.                                  | Approval-card UX copy                                  |
| Bring the mess. Keep the meaning. Move the work.             | Weekly-loop demos · content                            |
| "I gave my [X] an AI teammate — watch it do my actual work." | TikTok hook (SOT §1.9)                                |
| Open-source. Self-hostable. Bring your own AI key.           | Universal end-card + final CTA sub                    |

## One story, three emphases (messaging matrix)

| SB7 beat            | ICP 1 · Lean Builders                 | ICP 2 · Sovereign Operators       | ICP 3 · One-Person Studios            |
| ------------------- | ------------------------------------- | --------------------------------- | ------------------------------------- |
| Villain             | Context decays across tools and AI sessions | Data/context leaving your control | Ideas outrunning your hours                |
| Guide proof         | Brief + approvals + recurring loop         | AGPL + BYOK + self-host           | The 45s weekly-loop demo                   |
| Plan step to stress | Keep the context and move it forward        | Start anywhere (including your AI)| Move it forward without becoming the admin |
| Success             | Team follows work through without an admin layer | Leverage without surrender   | "My work has a home and I have it together" |
| CTA flavor          | Start free → invite team              | Deploy the compose file           | Start free → first brain-dump         |

## Voice & vocabulary

**Voice:** calm, concrete, first-person-plural sparingly. Contractions on. Short declaratives. Numbers over adjectives. One metaphor per section, maximum.

**Say:** quiet · home · remembers · context · teammate · calm · approve / your yes · follow through · brain-dump · drafts · ship · workspace · your keys.
**Never:** copilot, agent (in marketing copy), AI-powered, supercharge, 10x, revolutionize, seamless, magic (as a claim), blazing, unleash, game-changer.
**Rules:** Atlas is _he_ (fixed identity, SOT §PRD-4) and does verbs, not miracles — Atlas _drafts, triages, organizes, asks_; he never _transforms, revolutionizes, empowers_. ™ on first prominent DragonFruit/Atlas mention per page + footer. "Sheets," "Docs," "Tasks" are capitalized product nouns; generic usage stays lowercase.

## Anti-narratives (stories we refuse to tell)

- "AI will do everything" — breaks the approval-trust beat (62% of workers distrust agents; our story is _why we're different_).
- "Powerful enough for enterprise" — feeds the machinery villain we exist to kill.
- "Fork of Plane" as the lead — attribution lives honestly in the footer; the story leads with Atlas (SOT §1.7).
- Feature-listing without the villain — features only appear as answers to a named pain.
- "AI control plane" on the homepage — useful internal/partner language, but too technical and self-important for the customer story.
- "Replace ChatGPT/Claude" — DragonFruit should make the AI a customer already uses more useful by giving work a safe, durable home.
- "Atlas knows everything" — context is scoped, sourced, visible, and correctable; never imply secret omniscience.
