# Plan 032 / PRD: Work That Remembers

> **Bet:** Shared, visible, correctable project context becomes DragonFruit’s strongest reason to remain the home of the work.  
> **Portfolio:** AI-native product strategy  
> **Status:** Proposed; builds on a partially shipped earlier PRD  
> **Priority:** P1  
> **Effort:** M, approximately 3–5 engineering weeks plus quality evaluation  
> **Risk:** Medium–High — incorrect durable context can silently degrade every later workflow  
> **Depends on:** no engineering dependency; Plan 031 consumes this layer; Plan 033 requires it  
> **Related:** `../../docs/prd-brief-as-atlas-memory.md`  
> **Planned at:** commit `d2ca9cd196`, 2026-07-30

## Product decision

DragonFruit will have a legible hierarchy of context:

1. **Workspace Brief** — team-wide, human-curated context.
2. **Project Brief** — project-specific, human-curated context that may refine the workspace baseline.
3. **Source Docs and Tasks** — detailed evidence retrieved when relevant.
4. **Atlas memory** — lower-trust working memory that is visible and correctable.
5. **Context proposals** — suggested changes that become canonical only after a person accepts them.

The model, Atlas, and external AI interfaces are replaceable. The user-owned context layer is durable.

The public promise is:

> **Explain it once. Keep it correct.**

## Problem

The earlier Brief PRD correctly identified the core problem: the best human-authored context was invisible to Atlas, while Atlas memory was invisible to users.

The repository has since shipped important foundations:

- `Page.is_brief` provides durable Brief identity;
- Project and Workspace Brief content is injected into issue and page-comment agent prompts;
- Workspace Brief acts as the baseline and Project Brief as the project layer;
- `search_docs` and `read_doc` retrieve scoped source Docs;
- Atlas can create/update the canonical Project Brief;
- `AgentMemory` supports search, use counts, provenance text, and admin/member CRUD APIs.

The remaining product gap is legibility and trust:

- there is no clear Workspace Brief editing surface;
- users cannot see, in one place, the hierarchy Atlas used;
- the web app does not expose a usable memory review/correction surface;
- direct Project Brief replacement is too coarse for routine learning;
- Atlas cannot propose a small context change with evidence and have it accepted/rejected;
- memory provenance is a short text field, not a durable link to source evidence;
- there is no versioned record of which context informed a run;
- external AI tools do not receive the same curated context package;
- context quality and correction are not measured.

Without these pieces, “Atlas remembers” risks feeling like an opaque claim rather than a user-controlled capability.

## User and job story

**Primary user:** a founder, project lead, operator, or IC who repeatedly explains the same goals, constraints, vocabulary, and decisions.

> When the team or an AI learns something important about our work, I want to see where that knowledge came from, correct it, and make it apply consistently, so future work starts with the right context rather than another blank prompt.

## Desired outcome

Within four weeks of beta:

- 70% of retained design-partner workspaces have a non-empty Workspace or Project Brief;
- 80% of test users can identify and correct a seeded wrong fact without support;
- the next relevant run uses an accepted correction accurately;
- fewer than 5% of accepted context proposals are reverted as wrong or misleading;
- repeated clarification caused by already-documented context decreases in the design-partner cohort.

## Context principles

1. **Visible beats clever.** Users can inspect what the system believes.
2. **Canonical context is human-owned.** Atlas may propose; people decide.
3. **Evidence stays attached.** Durable facts link to their source when possible.
4. **Scope is explicit.** Workspace, Project, Doc, Task, and personal context do not blur.
5. **Precedence is deterministic.** Project context may refine the workspace baseline; source evidence may reveal a conflict but does not silently rewrite a Brief.
6. **History matters.** Users can see what changed and restore prior canonical context.
7. **Absence is not permission.** Missing guidance never implies Atlas may take a risky action.
8. **Retrieval is permission-filtered.** Context never expands a user’s data access.

## Scope

### V1

- Workspace Brief creation and editing in Workspace Settings;
- visible “Atlas reads this” treatment on Workspace and Project Briefs;
- a context inspector showing the layers available to a run;
- memory list/search/edit/delete UI with clear scope and provenance;
- evidence-backed context proposals;
- accept/edit/reject flow for proposals;
- safe append/section update into a Brief rather than full replacement;
- a context snapshot attached to each new AgentRun;
- the same context package available to approved internal and external tools;
- context-quality telemetry and an evaluation set.

### Non-goals

- embeddings or semantic search over the entire workspace;
- autonomous Brief rewriting;
- hidden personality customization;
- cross-workspace memory;
- personal surveillance or inferred sensitive traits;
- treating activity history as complete enterprise audit;
- storing private model chain-of-thought;
- replacing the source Docs with summaries.

## Conceptual model

### Brief

A canonical, collaborative Doc with a defined scope.

- Workspace Brief: one per workspace, no project relationship.
- Project Brief: one per project.
- Brief body: user-editable content.
- Brief history: normal Doc version history once Plan 030 ships.

### Memory

A compact working fact used for retrieval. It is not automatically canonical.

States:

- `active`
- `disputed`
- `promoted`
- `superseded`
- `deleted`

### Context proposal

A proposed addition, correction, or replacement to canonical context.

Fields:

- workspace;
- optional project;
- target Brief;
- proposing actor (`atlas`, human, integration);
- proposal type (`add`, `correct`, `replace_section`, `remove`);
- proposed text;
- explanation visible to the user;
- source references;
- confidence band (`low`, `medium`, `high`) as a product hint, not a truth score;
- status (`pending`, `accepted`, `edited_and_accepted`, `rejected`, `expired`, `superseded`);
- reviewed by/at;
- applied version or transaction id;
- timestamps.

### Context source reference

A typed pointer:

- `page`
- `issue`
- `comment`
- `agent_run`
- `chat_message`
- `meeting`
- `external_import`
- `manual`

Store object id, safe display label, and a captured excerpt/hash sufficient to explain the proposal even if the source later changes. Resolve links through normal permissions.

### Context snapshot

The bounded set of context actually supplied to a run:

- Workspace Brief version/id and truncation state;
- Project Brief version/id and truncation state;
- memory ids;
- retrieved Doc/Task source ids;
- precedence/conflict notes;
- token/character budget;
- created timestamp.

The snapshot explains inputs; it does not store hidden reasoning.

## Product behavior

### Workspace Brief

Workspace Settings → Context contains:

- Workspace Brief editor;
- plain-language explanation: “Atlas uses this as the baseline for every project”;
- last editor and last updated time;
- history access;
- empty-state starter prompts for goals, customers, vocabulary, constraints, and working agreements.

Only authorized workspace roles can edit. Members who can use Atlas can read the effective context unless a future field-level privacy model says otherwise.

### Project Brief

The existing Project Brief gains:

- “Atlas reads this” status;
- effective precedence note;
- “What Atlas sees” preview;
- pending proposal count;
- history;
- clear difference between replacing the whole Brief and accepting a small proposal.

### Context inspector

For an Atlas run or external workflow, show:

- Workspace Brief used;
- Project Brief used;
- memories used;
- source Docs/Tasks read;
- truncated or unavailable sources;
- conflicts or stale references;
- links to inspect and correct each item.

Do not imply that displaying a source reveals the model’s private reasoning.

### Proposal flow

1. Atlas identifies reusable context.
2. Atlas calls `suggest_context_change` with target scope, proposed text, reason, and sources.
3. DragonFruit creates a pending proposal; it does not mutate a Brief.
4. The user accepts, edits and accepts, or rejects.
5. Acceptance applies a narrowly scoped collaborative Doc operation.
6. The resulting Brief version and reviewer are linked back to the proposal.
7. Related memories become promoted/superseded when appropriate.

### Conflicts

When Workspace Brief, Project Brief, memory, or a current source disagree:

- do not silently choose based only on recency;
- prefer explicit Project Brief guidance over Workspace Brief for that project;
- prefer accepted Brief content over unpromoted memory;
- surface material conflicts to the user or request help;
- link the correction path.

## Agent/tool requirements

Add or refine internal tools:

- `get_effective_context`
- `search_docs`
- `read_doc`
- `search_memory`
- `suggest_context_change`
- `list_context_proposals`

External access through Plan 031:

- `dragonfruit_get_project_context`
- `dragonfruit_get_brief`
- optionally `dragonfruit_suggest_context_change`

External clients must not receive raw `AgentMemory` rows by default. Return the effective, permission-filtered context package or explicitly granted context records.

## API requirements

Workspace Brief:

- get/create/update the single Workspace Brief;
- enforce uniqueness transactionally;
- use the collaborative editor write path.

Context proposals:

- list/filter by scope and status;
- create from trusted internal tools and authorized external sources;
- accept/edit/reject;
- prevent double application;
- enforce target Brief and source permissions;
- return the applied Brief version/transaction.

Context inspector:

- retrieve a run’s snapshot;
- resolve display metadata through current permissions;
- redact sources the current viewer can no longer access.

Memory:

- retain existing CRUD endpoints;
- add state, structured provenance, and promotion links;
- tighten role rules so editing a shared memory is a deliberate workspace capability.

## Data and migration requirements

Extend `AgentMemory` rather than replacing it:

- scope/project when needed;
- state;
- structured source references;
- promoted proposal/Brief reference;
- superseded-by reference;
- last verified timestamp.

Add `ContextProposal` and `AgentContextSnapshot` models in the existing agent domain unless licensing boundaries require an isolated app.

Migration requirements:

- existing memories become `active`;
- existing source strings are preserved as legacy provenance;
- no migration may invent source links;
- backfill must be bounded and reversible where practical.

## Telemetry

Capture:

- `brief_created`
- `brief_updated`
- `context_inspector_opened`
- `context_proposal_created`
- `context_proposal_accepted`
- `context_proposal_edited_accepted`
- `context_proposal_rejected`
- `memory_corrected`
- `context_conflict_detected`
- `context_used_in_run`

Measure:

- workspaces with non-empty Briefs;
- accepted/rejected/reverted proposal rate;
- time to proposal review;
- repeated clarification rate;
- context-related user corrections;
- workflow completion with and without effective Brief context.

Never send Brief text, memory values, excerpts, or source content to third-party analytics.

## Evaluation plan

Create a small versioned evaluation set using synthetic projects:

- a fact present only in Workspace Brief;
- a Project Brief override;
- an outdated memory conflicting with the Brief;
- a relevant source Doc outside the initial prompt;
- a source the actor cannot access;
- a long Brief requiring truncation and on-demand read;
- a wrong fact corrected between runs;
- ambiguous guidance requiring human input.

For each case, assert:

- correct sources included or retrieved;
- precedence honored;
- restricted sources absent;
- conflicts surfaced;
- correction used on the next run;
- no unsupported claim that the system “remembered” hidden context.

## Acceptance criteria

- [ ] A workspace admin can create and edit the single Workspace Brief.
- [ ] A project member can understand the difference between Workspace and Project Brief context.
- [ ] Every new Atlas run records a bounded, inspectable context snapshot.
- [ ] Users can list, search, edit, dispute, promote, supersede, and delete permitted memories.
- [ ] Atlas cannot silently write canonical Brief context through the learning flow.
- [ ] Context proposals require one explicit review and cannot be applied twice.
- [ ] Accepted proposals update the intended Brief through a safe collaborative-editor path.
- [ ] Source references and reviewer attribution remain attached.
- [ ] Project guidance deterministically refines the workspace baseline.
- [ ] Material conflicts trigger visible handling rather than silent selection.
- [ ] External surfaces receive the same effective context subject to scopes and permissions.
- [ ] Seeded wrong context can be corrected and the correction is used on the next run.
- [ ] Context telemetry contains no user content.

## Implementation plan

### Phase 0 — characterize the shipped baseline

- Update `docs/prd-brief-as-atlas-memory.md` status to reflect implemented and missing phases.
- Add characterization tests for current Workspace/Project Brief lookup, injection, truncation, Doc retrieval, and direct Project Brief update.
- Build the synthetic context evaluation fixtures before changing behavior.

STOP if multiple active Workspace Briefs or Project Briefs can be selected nondeterministically. Repair identity/uniqueness first.

### Phase 1 — make canonical context visible

- Add Workspace Settings → Context.
- Reuse the existing collaborative Doc editor and Brief identity.
- Add “Atlas reads this,” precedence, empty-state coaching, and effective-context preview.
- Add Brief history entry points aligned with Plan 030.
- Ensure the feature works without Atlas/model configuration.

Expected files:

- workspace Settings route/components;
- `apps/web/core/components/project/brief/`;
- page/Brief services and types;
- focused web tests.

### Phase 2 — expose and correct memory

- Extend `AgentMemory`.
- Add a Memory section under Context with filters for scope, source, state, and last used.
- Add edit/dispute/delete/promote actions with role enforcement.
- Replace free-text-only provenance for new memories with typed references.
- Preserve legacy source strings for old rows.

Expected files:

- `apps/api/plane/db/models/agent.py`;
- migration;
- serializers/views in the existing agent API;
- web agent service/types;
- new Context settings components;
- contract and UI tests.

### Phase 3 — context proposals

- Add proposal/source-reference models and endpoints.
- Add `suggest_context_change` to task/page-comment/chat Atlas surfaces.
- Create accept/edit/reject UI.
- Apply accepted updates through a narrowly scoped Doc transaction.
- Link accepted changes to Brief history and memory state.

Do not use direct database HTML replacement for a mounted Yjs Doc. Reuse a proven document reconciliation path or keep the accepted proposal as a reviewable change until a safe write can occur.

### Phase 4 — run snapshots and inspector

- Snapshot the context package when a run starts and append retrieved sources as tools execute.
- Add the inspector to run details and actionable inbox surfaces.
- Enforce view-time source permissions.
- Add truncation, stale-source, and conflict indicators.

### Phase 5 — external parity

- Expose effective context through Plan 031’s canonical tool layer.
- Confirm external clients cannot bypass source permissions or retrieve unpromoted memory.
- Include external client/source attribution on proposals.

### Phase 6 — quality loop

- Run the synthetic evaluation set in CI where deterministic.
- Review context-related failures weekly during beta.
- Add product metrics dashboards based on event metadata, not user content.
- Tune prompt budgets only after measuring truncation and retrieval behavior.

## Verification

Minimum:

- model/migration tests;
- Workspace/Project Brief uniqueness and precedence tests;
- permission matrix for Brief, memory, proposal, and snapshot APIs;
- proposal concurrency/idempotency tests;
- collaborative Doc update/review tests;
- context snapshot redaction tests;
- evaluation fixtures;
- web unit tests and typecheck;
- full API and repository checks.

Repository commands:

- `pnpm test:api`
- `pnpm --filter=web test:unit`
- `pnpm --filter=web check:types`
- `pnpm check`

## Rollout

1. Internal workspaces with context inspector hidden behind a flag.
2. Five design partners; seed and correct known test context.
3. Enable proposals but require admin review.
4. Expand review permission after observing quality.
5. Expose effective context to external clients only after permission and redaction tests pass.

## Risks and mitigations

| Risk                                         | Mitigation                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Wrong memory compounds across workflows      | Human-owned Brief, proposal review, conflict handling, snapshots, correction tests |
| Users cannot tell what is canonical          | Explicit hierarchy, scope labels, effective-context preview                        |
| Sensitive context leaks                      | Existing entity permissions, view-time redaction, scoped external grants           |
| Brief becomes an unstructured dumping ground | Starter sections, proposals targeted to sections, compact coaching                 |
| Context consumes excessive tokens            | Bounded injection, on-demand reads, measured truncation                            |
| Direct writes corrupt collaborative Docs     | Proposal/review flow and proven Yjs reconciliation only                            |
| “Memory” sounds creepy or magical            | User-visible sources, correction, deletion, and plain language                     |
