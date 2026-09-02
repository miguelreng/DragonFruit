# Plan 053 / PRD: Project Context Sources

> **Bet:** A project keeps its context as people move between a local folder, Drive, Codex, Claude, and DragonFruit—without opaque model memory becoming the source of truth.  
> **Portfolio:** AI-native product strategy  
> **Status:** In progress — source foundation, bounded context packs, Atlas consumption, and the V1 Google Drive connection/picker/manual refresh are shipped; snapshots, handoff loop, and reviewed promotion remain  
> **Priority:** P1  
> **Effort:** M–L, approximately 4–6 engineering weeks after Plan 032  
> **Risk:** Medium–High — a source connector can expose secrets, stale files, or misleading context if selection and provenance are unclear  
> **Depends on:** Plan 032 Phases 1 and 4; Plan 031 only for a later direct Claude/Codex handoff API  
> **Planned at:** working tree, 2026-08-12

## Product decision

DragonFruit will let a project attach an authorized external folder as a **Project Context Source**. The first source is a user-selected Google Drive folder, for the workflow where a local code folder is synced to Drive and shared by coding agents.

The folder remains user-owned evidence. DragonFruit remains the system of record for Tasks, Docs, approvals, canonical Briefs, and activity. Atlas can retrieve allowed source files and propose context changes, but a sync never silently changes a Brief or durable memory.

> **Public promise:** Work anywhere. Return with the context intact.

## Problem

A founder can work in one local repository with Codex and Claude, with that directory replicated to Drive. Useful project understanding is distributed across `AGENTS.md`/`README`, strategy and planning docs, current code, agent decisions, and DragonFruit Tasks/Docs. Returning to Atlas requires re-explaining it.

Copying the whole folder into a prompt is expensive, noisy, hard to audit, and can leak secrets. Treating chat history as durable memory is invisible, stale, and not reliably correctable. Plan 032 makes in-product context visible and reviewable; Plan 031 lets external AI act on DragonFruit. Neither yet makes the existing project folder a safe, legible source for Atlas.

## User and job story

**Primary user:** a founder or engineer who works in one local project folder with Claude or Codex and wants to continue that work in DragonFruit.

> When I return to DragonFruit after another AI session, I want Atlas to know the project instructions, current decisions, and relevant handoff without pasting the repository again, so I can continue while retaining control over what becomes project truth.

## Desired outcome

In a three-workspace assisted beta:

- each workspace connects one bounded folder and reaches a useful Atlas continuation within five minutes;
- users can identify every external file that informed an Atlas run;
- no excluded or unauthorized file body is retrievable by Atlas;
- no sync silently changes a Workspace Brief, Project Brief, Task, Doc, or memory; and
- users report fewer repeated project explanations than their prior copy/paste workflow.

## Context model

| Layer | Role | May change automatically? |
| --- | --- | --- |
| Drive folder / local replica | User-owned external evidence | Yes, through source refresh |
| Project Context Pack | Bounded selection of relevant source revisions | Yes, through deterministic refresh |
| Workspace and Project Briefs | Human-curated, canonical guidance | No; proposals require review |
| Atlas memory | Visible, lower-trust working context | Never from sync alone |
| Tasks, Docs, approvals, activity | DragonFruit system of record | Only through existing permissions and approvals |

### Portable folder convention

The connector works without a special file, but offers a convention Claude and Codex can follow in the shared folder:

```text
.dragonfruit/
  context.yaml
  handoffs/
    2026-08-12-atlas-api.md
```

`context.yaml` only narrows the selection. It is data, never executable instructions, and cannot override DragonFruit's safety exclusions.

```yaml
version: 1
include:
  - AGENTS.md
  - README*
  - DRAGONFRUIT_SOURCE_OF_TRUTH.md
  - docs/**/*.md
  - plans/**/*.md
exclude:
  - .env*
  - **/node_modules/**
  - **/dist/**
handoff_directory: .dragonfruit/handoffs
```

DragonFruit applies its own secret/binary denylist, maximum file and total-size limits, and an explicit preview. A user manifest can never re-include an excluded file.

### Handoff note

A handoff is short Markdown, written by a human, Claude, or Codex into the chosen folder. It has an explicit author/source and links to changed files or Tasks where possible:

```md
# Handoff: <short topic>

## Outcome
## Decisions and constraints
## Changed or reviewed files
## Open questions / next action
```

Atlas treats this as attributed evidence: it can summarize or link it to work, and may propose a Brief change. It never promotes a handoff to canonical context automatically.

## V1 scope

- Google Drive authorization with least-privilege read-only access, rechecked against official provider guidance at build time;
- a folder picker that binds one Drive folder to one DragonFruit project;
- source inventory and eligible-file preview before file content is available to Atlas;
- deterministic include/exclude rules, optional manifest, server-owned sensitive-file/binary exclusions, file-size limits, and a user allowlist;
- immutable, content-hashed file revisions with source path, provider version/time, refresh time, and connection identity;
- manual refresh plus incremental refresh only where the provider signal is reliable;
- a Project Context Pack composed of selected small source files, current Briefs, and recent handoffs;
- Atlas tools to list, search, and read permitted source files on demand;
- run-level context snapshots with file revisions and truncation state;
- project Context UI for source status, freshness, selection, inspect, refresh, disconnect, and source-content deletion;
- handoff discovery plus a **Continue from latest handoff** Atlas entry point; and
- proposal-only promotion from source evidence into Briefs or memory through Plan 032.

## Non-goals

- arbitrary hosted access to a local filesystem;
- writing to Drive or the user's local folder;
- recursively ingesting a whole Drive, workspace, or personal account;
- automatic promotion of repository files, handoffs, or agent chat into canonical context;
- indexing/embedding every file before the selected-context loop proves value;
- executing code, reading environment variables, or collecting secrets;
- a code-host replacement: GitHub is a later source for commit/diff history; and
- requesting or importing model chain-of-thought.

## Experience

### Connect a folder

1. In Project → Context → Sources, the user selects **Connect Drive folder**.
2. DragonFruit obtains read-only authorization and presents a folder picker.
3. The user sees candidate files, exclusions, total size, and unrecognized types.
4. They select the initial compact pack: instructions, overview docs, plans, and handoffs. There is no “everything” default.
5. Atlas drafts a source-cited Project Brief; the user accepts, edits, or rejects it through Plan 032.
6. The Context page exposes freshness, refresh, selection changes, and disconnect.

### Continue with Atlas

For a connected project, Atlas receives context in this order:

1. effective Workspace and Project Briefs;
2. selected instructions and compact overview files;
3. eligible recent handoffs;
4. task/run-specific DragonFruit sources; then
5. on-demand source reads via explicit search/read tools.

The run inspector shows each external file's path, revision, inclusion reason, size/truncation, freshness, and current access state. “Atlas sees this” means the bounded package, not the whole Drive folder.

### Refresh and conflicts

- A changed file creates a new revision; historical run snapshots never change.
- A removed file or expired authorization becomes unavailable/stale and Atlas says so.
- If a current source conflicts with an accepted Brief, Atlas surfaces the conflict. The Brief wins until a person accepts a correction.
- Disconnect stops new retrieval immediately. The user may delete retained source content under a documented retention policy; the audit record need not retain file bodies.

## Conceptual data model

Add a narrowly scoped source domain; do not overload `AgentMemory` or file attachments.

### `ExternalSourceConnection`

- workspace, provider, encrypted provider credential reference, connection owner;
- status (`active`, `reauthorization_required`, `revoked`, `error`);
- granted capability summary, last successful refresh, last error category, timestamps.

### `ProjectContextSource`

- workspace, project, connection, provider folder id, display name;
- selection configuration and manifest revision/hash;
- status (`pending`, `active`, `stale`, `error`, `disconnected`);
- refresh cursor and timestamps.

### `ProjectSourceFile` / `ProjectSourceRevision`

- source, provider file id, normalized relative path, MIME/type, eligibility/exclusion reason;
- immutable revision id, provider modified time/version, content hash, bounded extracted text or protected blob reference, byte/character count;
- extraction status; never a plaintext credential.

### `ProjectContextPack`

- project, source, ordered selected file/revision references, configuration version;
- inclusion reason (`instruction`, `overview`, `handoff`, `user_selected`), token/character budget, generated time;
- current flag while retaining prior packs for provenance.

Extend Plan 032's typed `ContextSourceReference` with `project_source_file` plus immutable revision identity. `AgentContextSnapshot` records references, hashes, and truncation state rather than duplicating every file body.

## Agent and API requirements

Internal Atlas tools:

- `get_project_context_pack`
- `list_project_sources`
- `search_project_sources`
- `read_project_source`
- `list_project_handoffs`
- `suggest_context_change`

Every call resolves workspace/project membership, source state, and file eligibility. Output cites path plus revision. Start with bounded lexical/path search; semantic retrieval is deferred until its quality and permission behavior can be evaluated.

Source APIs let authorized members connect, inventory, select, refresh, inspect, and disconnect a source. A content endpoint must accept DragonFruit project/source/file ids—not arbitrary provider ids—and enforce the selected-root boundary. Excluded file bodies are never returned from search or metadata routes.

## Implementation plan

### Phase 0 — assisted validation and threat model

- Support three local-folder → Drive → coding-agent workflows, beginning with DragonFruit itself.
- Record the files users actually choose, repeated continuation prompts, context mistakes, and sensitive-file near misses.
- Threat-model provider authorization, credential storage, revocation, sharing boundaries, path traversal, prompt injection, oversized files, and stale revisions.
- Test the handoff template with real Codex/Claude sessions before any direct-client API.

**Exit gate:** proceed only when a compact default pack beats a manually pasted summary for at least two participants without broadening data access.

### Phase 1 — source foundation and contracts

**Delivered (2026-08-15):** project-scoped source/file/revision models and migration; exact-path configuration; source-root/path, type, size, and secret safeguards; immutable revision storage; project APIs; a manual-provider ingestion boundary for safe validation; bounded context packs; and Atlas chat/task prompt consumption. Google Drive sources cannot accept arbitrary file bodies through the public endpoint.

- Add models, migrations, state transitions, permissions, retention/deletion policy, and audit events.
- Add a bounded provider interface for inventory/read/refresh; do not build an integration marketplace.
- Extend Plan 032 references and snapshots before Atlas can retrieve external content.
- Parse manifests as data with safe glob limits and a server-owned denylist.

### Phase 2 — Drive read-only connection and inventory

**Delivered (2026-08-15):** signed OAuth state, encrypted per-user/workspace Drive credentials, `drive.readonly` scope, a project-bound folder browser, synchronous manual refresh limited to the selected descendant tree, server-side file/depth/size limits, selected-file UI, freshness/error state, and disconnect. The initial refresh intentionally remains foreground and bounded (200 files / 10 directory levels / 2 MB per file); no Drive write permission or arbitrary provider-file endpoint exists.

- Implement OAuth consent/picker and secure credential handling.
- Bind the chosen provider folder to one project and inventory only descendants of that root.
- Build preview, selection, manual refresh, stale/error UI, and disconnect.
- Store content by revision hash with bounded extraction; reject unsafe file types by default.

**STOP** if credentials would be stored in plaintext, an arbitrary Drive file outside the selected root can be named, or excluded content is accessible through metadata/search.

### Phase 3 — Context Pack and Atlas continuation

- Assemble the ordered, token-bounded pack.
- Prefer `AGENTS.md`, selected overview docs, and handoffs; use tools for lower-priority detail.
- Add source-aware search/read and attach revisions to each context snapshot.
- Add Context UI and run-inspector provenance.

### Phase 4 — handoff loop and reviewed promotion

- Discover handoffs from the configured directory, render them, and support **Continue from latest handoff** plus optional Task linking.
- Route reusable facts exclusively through Plan 032's evidence-backed proposal/accept/edit/reject flow.
- Publish short templates/setup instructions that users can give Codex and Claude. No proprietary integration is required.

### Phase 5 — reliability and next-source decision

- Add incremental refresh only where reliable; manual refresh stays available.
- Test secrets, stale docs, conflicting Briefs, path aliases, removed files, large files, and malicious source text.
- Measure continuation quality and decide whether GitHub (diffs) or a local desktop connector is the next source.
- Only then consider Plan 031's authenticated endpoint for structured client-to-DF handoffs.

## Telemetry

Capture metadata only:

- `project_source_connection_started`
- `project_source_connected`
- `project_source_inventory_completed`
- `project_source_refresh_completed`
- `project_source_refresh_failed`
- `project_context_pack_created`
- `project_source_used_in_run`
- `project_handoff_detected`
- `project_handoff_used_in_run`
- `project_source_disconnected`

Use provider, state, file-type/count/size bucket, inclusion reason, freshness bucket, retrieval result, and proposal outcome as dimensions. Never send file bodies, snippets, OAuth credentials, likely-secret paths, or raw prompts to third-party analytics.

## Acceptance criteria

- [x] A user can connect one Drive folder to one project with read-only access and inspect inclusion before Atlas uses it.
- [x] DragonFruit never retrieves outside the selected root, including through search, refresh, or guessed provider identifiers.
- [ ] Server-owned exclusions and limits win over a manifest.
- [ ] Refresh creates immutable revisions and cannot change historical run snapshots.
- [ ] Atlas receives only the bounded pack by default and cites every retrieved external claim.
- [ ] Users see each source's path, revision, inclusion reason, freshness, and truncation state in the run inspector.
- [x] Drive changes cannot silently alter a Brief, Task, Doc, or memory. Handoff discovery remains pending.
- [ ] Disconnect stops access and lets the user delete retained source content under the documented policy.
- [x] Stale or unavailable access is visible; Atlas does not claim fresh access.
- [ ] Shared-folder Codex/Claude handoffs are discoverable and attributable without a provider-specific integration.
- [ ] Permission, root-boundary, secret-exclusion, revision, deletion, and proposal tests pass.

## Verification and rollout

Automate model/migration/state tests; workspace/project role matrices; root containment including encoded aliases; manifest denylist/size/type limits; credential revocation; revision immutability; pack order/budgets/citations/snapshots; prompt-injection-as-data; proposal review; disconnect/deletion; API tests and web typechecks.

Roll out to a synthetic internal fixture, then DragonFruit's own bounded repository with manual refresh, then three allowlisted design partners with a deletion drill. Expand Drive only after security and continuation gates pass. Choose GitHub or a local desktop connector from observed retrieval needs, not provider popularity.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Secrets/private files reach Atlas | Selected-root boundary, denylist, preview, type/size limits, read-only access, no full-drive index |
| Repository prompt stuffing | Compact ordered pack, explicit retrieval, budgets, inspector |
| Stale Drive copy conflicts with work | Revisions/freshness, manual refresh, immutable snapshots, conflict handling |
| Prompt injection in source files | Treat sources as untrusted data; narrow tools, permissions, approvals, adversarial tests |
| Handoffs become hidden truth | Attributed files, visible provenance, proposal-only promotion |
| Connector scope expands uncontrollably | One bounded Drive-folder case and provider contract before new sources |
