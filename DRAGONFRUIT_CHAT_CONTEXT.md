# DragonFruit — Chat Context

> Give this document to a new chat before discussing DragonFruit (DF). It is a concise working brief, not a replacement for the canonical strategy and PRD document: [`DRAGONFRUIT_SOURCE_OF_TRUTH.md`](./DRAGONFRUIT_SOURCE_OF_TRUTH.md).
>
> **Last reconciled:** 2026-08-12 · **Repository state:** `main` has an active, shared dirty working tree. Preserve unrelated changes.

## One-sentence brief

DragonFruit is an AGPL-3.0, open-source and self-hostable workspace for **Tasks, Docs, and shared project context**, designed to feel calm and beautiful, with **Atlas** as its single built-in AI teammate that helps move work forward safely.

## The product thesis

**A quiet place where ideas become work. Start anywhere; your context stays here.**

People begin work in chats, meetings, notes, code, and task lists. DragonFruit should be the trusted home that keeps the resulting context, decisions, Tasks, Docs, permissions, approvals, and history together. External AI clients may be useful interfaces, but DragonFruit remains the system of record and execution layer.

The product must never depend on opaque, uncorrectable model memory. Durable context must be visible, sourced, editable, permission-aware, and owned by the workspace.

## Audience and why they choose it

- **AI-forward small teams (5–50):** want AI to safely triage, draft, plan, and follow through on shared work.
- **Privacy/self-hosting teams:** want AI leverage while retaining data control and model-cost control.
- **AI-curious creators and builders:** want a low-friction, visually compelling workspace where the AI magic is approachable.

The practical emotional promise is: “I can start with a messy idea and still look organized; the system keeps the meaning while helping the work move.”

## Core principles — use these to evaluate every product idea

1. **Tasks + Docs are the product.** Keep the primary experience simple; avoid exposing Plane-like sprint machinery as the center of the product.
2. **One Atlas.** Atlas is a fixed, recognizable AI teammate with one name, personality, and avatar. Do not propose a marketplace or user-created/named agents unless strategy explicitly changes.
3. **Start anywhere; work stays here.** DragonFruit and authorized external AI clients operate on the same canonical workspace.
4. **Legible memory, not hidden memory.** Context needs provenance, correction, review, and sensible scope.
5. **Trust before autonomy.** Important actions are permissioned, explainable, attributable, recoverable, and approval-aware.
6. **Open source and ownership are features.** AGPL, self-hosting, export, and BYOK build trust; the moat is polish, brand, context gravity, and reliable execution—not secret code.
7. **Calm, Craft-like quality.** Prefer restraint, readable typography, space, clear hierarchy, and a thoughtful writing experience over dashboard density or novelty.

## Positioning and approved language

Use these ideas consistently:

- “A quiet place where ideas become work.”
- “Start anywhere. Your context stays here.”
- “DragonFruit keeps your ideas, Docs, Tasks, and project context together.”
- “Atlas, your AI teammate, helps move the work forward—and asks before anything important changes.”
- “Open-source. Self-hostable. Bring your own AI key.”

Avoid positioning DF as merely “another AI chatbot,” “a general agent marketplace,” or “a project-management suite with every methodology.” The story is a calm home for work that remembers and follows through.

## What is already in the product

DragonFruit is an opinionated fork of [Plane](https://github.com/makeplane/plane). It retains Plane’s foundational workspace and project-management domain, while substantially changing the experience.

- Task/project-management primitives, pages, files, comments, search, permissions, and activity history.
- Craft-inspired rich Docs based on TipTap/ProseMirror, with refined typography and focus on writing quality.
- Atlas agent runtime: BYOK-capable provider abstraction, encrypted provider keys, inline and chat invocation, tool-use, run telemetry, cancellation, and cost capture.
- Atlas can work in the workspace through bounded tools, including task and document-related actions; important action design should remain approval-aware.
- Workspace Docs, diagrams (Mermaid), whiteboards (Excalidraw), drafts, public publishing, version history, Docs embedding, and a native task calendar with optional read-only Google Calendar overlay.
- Responsive Docs + Atlas layouts, document review/edit flows, a macOS menu-bar companion, and an MCP server baseline for external access.

## Current strategic direction

The next major bets are intentionally sequenced, not all immediate build work:

1. **Work That Remembers:** workspace/project Briefs, visible context, provenance, corrections, context proposals, and inspectable run-level context.
2. **Project Context Sources:** a bounded, read-only external folder source (first Google Drive), deterministic context packs, portable Codex/Claude handoffs, and proposal-only promotion to canonical memory.
3. **Work from Anywhere:** OAuth-authorized MCP/external clients with complete safe actions, approvals, idempotency, and audit parity.
4. **Recurring Operating Loop:** turn messy inputs into an approved weekly plan, follow-through, blocker follow-up, and report. Validate this manually with a paid concierge cohort before building orchestration.

The near-term product research goal is to prove that shared, correctable context plus safe follow-through earns retention and willingness to pay—rather than optimizing for chat volume.

## Business model (directional; pricing is not final)

- **Free self-hosting:** the full open-source AGPL product is a trust and acquisition channel.
- **DragonFruit Cloud:** hosted SaaS is the primary revenue path; workspace-based versus per-seat packaging is still being tested.
- **Atlas BYOK:** users can bring their own model key, keeping inference costs under their control and DF’s COGS low.
- **Atlas Cloud:** a future managed-model option can meter usage for customers who prefer no key management.
- **Paid differentiation:** shared context, recurring workflows, governance, external AI access, managed usage, support, and hosted convenience—not arbitrary removal of the core experience.

Do not treat the current illustrative plan prices, permanent free limits, or final feature gates as decided. Billing and entitlement work is a known future critical path, not a finished system.

## Visual and interaction direction

- The writing surface matters as much as tracking: comfortable reading measure, serif display headings (Newsreader), humanist sans body (Figtree), generous leading, and restraint.
- Use a cohesive Solar icon system in product UI; do not reintroduce mixed old icon libraries.
- Favor calm, editorial visual hierarchy; illustrations only when they explain something, not as generic decoration.
- Keep interactions direct and reversible. Make state, loading, permission boundaries, and errors legible.
- Avoid default “SaaS dashboard” visual clutter, overly rounded cards, generic gradients, or over-animated UI.

## Technical map

| Area | Location / technology |
| --- | --- |
| Main product | `apps/web` — React Router 7, React, Tailwind, MobX/Zustand patterns |
| Backend | `apps/api` — Django + Django REST Framework, task/domain/agent APIs |
| Realtime collaboration | `apps/live` — Node + HocusPocus |
| Public publishing | `apps/space` |
| Instance administration | `apps/admin` |
| macOS companion | `apps/Copilot` — SwiftUI menu-bar app |
| Rich editor | `packages/editor` — TipTap/ProseMirror; DF visual layer in `src/styles/dragonfruit.css` |
| Shared UI | `packages/ui` and `packages/propel` |
| Shared app state | `packages/shared-state` — MobX stores |
| External-agent baseline | `packages/mcp-server` |

Infrastructure uses Postgres, Redis, S3-compatible storage, and Docker locally. Web deployments are Vercel-based; API deployment topology is being actively settled, so do not claim production deployment details without checking the current configuration.

## Engineering guardrails for work in this repo

- Work directly on `main`; do not create branches or worktrees.
- The working tree is shared and currently contains unrelated active changes. Do not reset, revert, overwrite, stage, or “clean up” files outside the task.
- Use TypeScript strict mode. Internal JS packages use `workspace:*`; external packages use `catalog:`.
- Build reusable UI in `@plane/ui` where appropriate; use the established component and state patterns rather than introducing a parallel system.
- Add focused tests for product changes. Useful validation commands: `pnpm check`, `pnpm check:types`, `pnpm check:lint`, and the relevant targeted test/build.
- Format with `pnpm fix:format`; linting is OxLint/oxfmt.
- Never commit or push unless explicitly asked. Pushing `main` deploys web/API.
- Preserve Plane compatibility where it is not strategically necessary to diverge. Keep custom surfaces concentrated and overlays additive when possible so upstream merges stay manageable.

## How to handle a request in a new chat

Before proposing a solution, identify whether it affects:

- the core promise (Tasks + Docs + remembered context);
- Atlas trust, permissions, approval, cost, or model-provider behavior;
- the calm/editorial interaction bar;
- self-host/open-source compatibility; or
- a future bet that must be validated before productizing.

Then recommend the smallest coherent change. Clearly label assumptions and unresolved product decisions. For implementation, inspect the existing local pattern first and protect the active dirty worktree.

## Sources of deeper truth

- **Canonical strategy, business, founder decisions, and engineering PRDs:** [`DRAGONFRUIT_SOURCE_OF_TRUTH.md`](./DRAGONFRUIT_SOURCE_OF_TRUTH.md)
- **AI-native PRDs and intended sequencing:** [`plans/ai-native/README.md`](./plans/ai-native/README.md)
- **Current implementation plan statuses:** [`plans/README.md`](./plans/README.md)
- **Brand narrative and landing guidance:** [`docs/ux/02-brand-story.md`](./docs/ux/02-brand-story.md) and [`docs/ux/03-landing-ux-spec.md`](./docs/ux/03-landing-ux-spec.md)
- **Setup and architectural overview:** [`README.md`](./README.md)

When this brief and the Source of Truth differ, defer to the Source of Truth. When a detail may have changed in the repository, inspect the current code/configuration before stating it as fact.
