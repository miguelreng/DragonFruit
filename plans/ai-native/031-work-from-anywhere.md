# Plan 031 / PRD: Work from Anywhere

> **Bet:** DragonFruit remains the trusted home for work even when an external AI interface starts the action.  
> **Portfolio:** AI-native product strategy  
> **Status:** Proposed  
> **Priority:** P1  
> **Effort:** M–L, approximately 4–7 engineering weeks across API, auth, web, security, and partner QA  
> **Risk:** High — delegated authorization and external writes cross the product trust boundary  
> **Depends on:** focused design-partner validation; Plan 032 for the complete context promise  
> **Planned at:** commit `d2ca9cd196`, 2026-07-30

## Product decision

DragonFruit will support two equally valid ways to use a workspace:

1. directly through DragonFruit surfaces; and
2. through an authorized external AI client using DragonFruit tools.

The external AI is an interface and reasoning provider. DragonFruit remains the system of record, permission authority, approval engine, activity ledger, and workflow executor.

The public promise is:

> **Start anywhere. Your context stays here.**

## Problem

The native MCP endpoint proves that external AI clients can read and write DragonFruit data, but it is not yet a product-ready connection:

- the endpoint is workspace-slug-specific;
- authentication requires a manually issued API token;
- the protocol implementation identifies as revision `2024-11-05`;
- it accepts JSON-RPC batches even though newer MCP revisions removed batching;
- tools have no current MCP behavior annotations;
- write tools cover Tasks and comments but not the full idea → Doc → Task → approval loop;
- the endpoint returns mostly unstructured text;
- the write path does not use Atlas’s per-tool approval policies or pending-request lifecycle;
- external origin, client, scope, and delegated consent are not captured as a first-class audit trail;
- the separate `packages/mcp-server` wrapper and native Django endpoint create two surfaces that can drift.

This is sufficient for a founder-assisted experiment, but not for one-click connection from widely used AI clients or a public directory listing.

## User and job story

**Primary user:** a founder, operator, or tools-owning engineer already using ChatGPT, Claude, Codex, or another MCP-capable client.

> When I am already working in my preferred AI, I want it to safely read and update the same project my team uses, so I can act without copy/paste or losing the project’s context and controls.

## Desired outcome

Within four weeks of the beta:

- 5 design-partner workspaces connect at least one external client;
- 4 complete at least 3 useful external-origin workflows per week;
- at least 90% of external writes have a valid actor, client, workspace, scope, and activity record;
- no external client can exceed its granted workspace or scopes;
- risky actions require the same explicit approval standard as native Atlas actions.

## Current implementation baseline

### Reuse

- `apps/api/plane/app/views/mcp/base.py`
  - Streamable HTTP-style JSON-RPC endpoint.
  - Eight tools: list/get/create/update Tasks, add comment, list projects, search/read Docs.
  - Workspace membership enforcement through `APIToken`.
- `apps/api/plane/app/urls/mcp.py`
  - Read-write and read-only workspace endpoints.
- `apps/api/plane/db/models/api.py`
  - Workspace-scoped API tokens and activity logs.
- `apps/api/plane/bgtasks/agent_dispatch_task.py`
  - Tool-policy gating, approval pause/resume, document search/read, memory, and run telemetry.
- `apps/api/plane/app/views/agent/base.py`
  - Approval response and actionable-run inbox APIs.
- `packages/mcp-server`
  - Existing TypeScript adapter and smoke-test patterns.

### Do not duplicate

- Do not create a second project/task/domain service solely for MCP.
- Do not implement a parallel permission model.
- Do not let the TypeScript wrapper and Django endpoint remain independent public products. The Django endpoint is the canonical server; the wrapper may become a development adapter or be retired.

## Scope

### V1

- one stable remote MCP endpoint suitable for third-party client configuration;
- OAuth-based delegated authorization with explicit workspace selection;
- protected-resource and authorization-server metadata discovery;
- authorization-code flow with PKCE and refresh-token rotation;
- granular scopes and consent;
- structured, annotated read and write tools;
- safe Tasks, Docs, comments, approvals, and workflow-run actions;
- source attribution, idempotency, rate limits, and audit events;
- a Connections screen for connect/revoke/inspect;
- compatibility tests against at least two external MCP clients;
- founder-assisted beta documentation.

### Non-goals

- publishing to every AI marketplace in V1;
- arbitrary code execution;
- destructive delete tools;
- granting external clients direct database, object-storage, or model-key access;
- exposing private chain-of-thought;
- cross-workspace tools in a single call;
- replacing Atlas’s identity or internal runtime;
- rich embedded app UI before the tool-only loop proves repeat value.

## Load-bearing decisions

### Canonical endpoint

Expose a stable endpoint such as:

`POST /api/mcp/`

The OAuth grant binds the access token to exactly one workspace selected during consent. Tool calls do not accept a caller-controlled workspace slug.

Keep the existing slug endpoints temporarily for manually issued tokens and self-hosted compatibility. Mark them as legacy in documentation once the stable endpoint is ready.

### Authorization

Implement the current MCP authorization model:

- OAuth 2.1-compatible authorization code flow;
- PKCE using `S256`;
- OAuth Protected Resource Metadata;
- OAuth Authorization Server Metadata or OpenID Connect discovery;
- resource indicators/audience binding;
- short-lived access tokens;
- rotating refresh tokens;
- exact redirect URI validation;
- revocation and session inspection.

Support pre-registered clients first for controlled beta. Add Client ID Metadata Documents or dynamic registration only after a threat-model review.

### Scopes

Initial scopes:

- `workspace:read`
- `projects:read`
- `tasks:read`
- `tasks:write`
- `docs:read`
- `docs:write`
- `comments:write`
- `approvals:read`
- `approvals:respond`
- `workflows:run`

Scopes authorize the category of action; normal workspace and project permissions still authorize the specific object.

### Approval semantics

MCP/client confirmation does not replace DragonFruit approval policy.

- Read-only actions execute immediately.
- Low-risk writes may execute when both scope and workspace policy allow.
- Ask-gated actions create or reuse an `AgentRun`-compatible pending approval.
- Destructive actions are absent in V1.
- The external client receives a structured `needs_approval` result with a resumable request id.
- Approval may be completed in DragonFruit or through an explicitly scoped approval-response tool.

### Tool design

Use stable, namespaced names and structured content. Each tool advertises behavior annotations including read-only, destructive, idempotent, and open-world characteristics where supported by the negotiated protocol.

V1 tools:

**Orientation**

- `dragonfruit_list_projects`
- `dragonfruit_search_work`
- `dragonfruit_get_project_context`

**Tasks**

- `dragonfruit_list_tasks`
- `dragonfruit_get_task`
- `dragonfruit_create_task`
- `dragonfruit_update_task`
- `dragonfruit_add_task_comment`

**Docs and context**

- `dragonfruit_search_docs`
- `dragonfruit_get_doc`
- `dragonfruit_create_doc`
- `dragonfruit_propose_doc_update`
- `dragonfruit_get_brief`

**Trust and execution**

- `dragonfruit_list_pending_approvals`
- `dragonfruit_respond_to_approval`
- `dragonfruit_run_workflow`
- `dragonfruit_get_workflow_run`

Do not expose direct full-document replacement as a generic external tool in V1. Route collaborative Doc changes through the existing proposal/review path or a narrowly scoped server-side reconciliation path proven safe for Yjs content.

## Conceptual data model

Add a dedicated OAuth/integration boundary rather than overloading plaintext `APIToken.token`.

### `OAuthClient`

- `client_id`
- `name`
- `client_uri`
- `logo_uri`
- `redirect_uris`
- `registration_mode` (`pre_registered`, later `metadata_document` or `dynamic`)
- `is_active`
- timestamps

### `WorkspaceExternalConnection`

- `workspace`
- `user`
- `oauth_client`
- `display_name`
- `scopes`
- `status` (`active`, `revoked`, `expired`)
- `last_used_at`
- `revoked_at`
- timestamps

### `OAuthAuthorizationGrant`

- hashed authorization code or grant identifier
- connection
- redirect URI
- PKCE challenge and method
- requested/granted scopes
- resource/audience
- expiry and consumed timestamp

### `OAuthAccessToken` / `OAuthRefreshToken`

- store hashes, never retrievable plaintext;
- connection and audience;
- scopes;
- expiry;
- refresh-family identifier and rotation state;
- revoked/reused timestamps.

### `ExternalToolInvocation`

- workspace, user, connection, client;
- source surface;
- tool name and stable invocation id;
- target object type/id;
- requested scopes;
- result state (`completed`, `needs_approval`, `failed`, `denied`);
- linked `AgentRun` or approval request when applicable;
- latency and error category;
- timestamps.

Do not persist raw sensitive prompt bodies by default. Store bounded/redacted arguments or hashes where audit needs can be met without retaining content.

## API and protocol requirements

### Discovery and authorization

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server` or an accepted OIDC discovery equivalent
- `GET/POST /oauth/authorize`
- `POST /oauth/token`
- `POST /oauth/revoke`
- `POST /oauth/register` only if/when dynamic registration is approved
- `POST /api/mcp/`

Unauthorized MCP responses must use the correct HTTP status and `WWW-Authenticate` metadata challenge. Do not wrap authentication failure only inside an HTTP 200 JSON-RPC body.

### Idempotency

Every mutating tool accepts a caller-stable `idempotency_key`. Enforce uniqueness by connection + tool + key. Replays return the original safe result and do not duplicate Tasks, Docs, comments, approvals, or workflow runs.

### Permissions

- Resolve the user and workspace exclusively from the delegated grant.
- Apply existing role and project entity permissions to every object query.
- Filter list/search results before serialization.
- Return consistent forbidden/not-found behavior with the rest of the API.
- Re-check membership, connection status, token audience, and scope on every call.

### Rate limits

Rate-limit by connection, workspace, tool risk, and IP. Writes and search/read tools have separate budgets. Return retry metadata without revealing internal capacity.

## User experience

### Connect

1. The external client discovers authorization metadata.
2. DragonFruit asks the user to sign in if needed.
3. The user selects one workspace.
4. DragonFruit shows requested scopes in plain language.
5. The user connects.
6. DragonFruit returns the user to the client and records the connection.

### Consent copy

Show capabilities, not protocol jargon:

- View projects, Tasks, and Docs
- Create and update Tasks
- Propose changes to Docs
- See and respond to approval requests
- Run approved workflows

Clearly state that the external AI may send selected DragonFruit data to its own provider under that provider’s terms.

### Manage

Workspace Settings → Connections:

- client name and icon;
- connected by;
- granted scopes;
- last used;
- recent actions;
- revoke;
- reauthorize when scopes change.

## Telemetry

Capture:

- `external_connection_started`
- `external_connection_completed`
- `external_connection_failed`
- `external_connection_revoked`
- `external_tool_called`
- `external_tool_needs_approval`
- `external_tool_approved`
- `external_tool_denied`
- `external_workflow_completed`

Required dimensions:

- workspace;
- client/surface;
- tool;
- read/write/risk class;
- latency;
- result;
- approval requirement;
- originating plan.

Do not send user content, access tokens, document bodies, or tool arguments to third-party analytics.

## Acceptance criteria

- [ ] A user can connect a supported client without copying an API token.
- [ ] The consent grant is bound to one user, one workspace, one client, one audience, and explicit scopes.
- [ ] Tokens are short-lived, hashed at rest, refresh-rotated, revocable, and rejected after reuse/revocation.
- [ ] An external client cannot enumerate or mutate data outside the granted workspace or normal project permissions.
- [ ] All mutating tools are idempotent.
- [ ] Every external write has actor, client, origin, scope, target, timestamp, and result attribution.
- [ ] Ask-gated actions pause before mutation and can resume once.
- [ ] Doc writes cannot bypass collaborative-editor reconciliation or review safety.
- [ ] Tool metadata communicates read-only/destructive/idempotent behavior.
- [ ] Authentication failures use correct HTTP and discovery behavior.
- [ ] Existing self-hosted/manual-token MCP access has a documented compatibility path.
- [ ] Focused security, contract, and cross-client smoke tests pass.

## Implementation plan

### Phase 0 — validate before platform work

Use the existing token endpoint with five design partners. Document the ten most frequent successful and failed jobs. Do not finalize the public tool catalog until this evidence exists.

Exit gate:

- at least four partners repeat external-origin work for three weeks; or
- a clear job is identified that users will pay to run from an external surface.

### Phase 1 — extract a canonical tool/service layer

- Move MCP domain actions out of `apps/api/plane/app/views/mcp/base.py` into typed service modules.
- Reuse those services from the legacy endpoint and future stable endpoint.
- Add structured result types and idempotency boundaries.
- Add object-level permission characterization tests before changing behavior.
- Reconcile `packages/mcp-server`: development adapter only or removal after parity.

Expected files:

- `apps/api/plane/mcp/` (new package: registry, context, results, services)
- `apps/api/plane/app/views/mcp/base.py`
- `apps/api/plane/tests/contract/app/test_mcp_app.py`
- `packages/mcp-server/`

### Phase 2 — OAuth resource and authorization server

- Add models and migrations.
- Implement metadata, authorize, token, refresh, and revoke endpoints.
- Build consent and connection-management UI.
- Threat-model redirect validation, token replay, confused deputy, client impersonation, and scope escalation.
- Add audit/redaction tests.

Expected files:

- new isolated Django app or package for OAuth connection models and endpoints;
- `apps/api/plane/web/urls.py` and/or app URL registration;
- workspace Settings connection components;
- focused unit and contract tests.

STOP if the implementation would store recoverable access/refresh tokens in plaintext or reuse login-provider OAuth tables without a clean resource-server security model.

### Phase 3 — stable endpoint and safe tool parity

- Add `/api/mcp/`.
- Negotiate a current supported protocol revision while retaining explicit legacy compatibility.
- Add tool annotations and structured outputs.
- Implement scoped Tasks, Docs, approval, and workflow tools.
- Add source attribution and telemetry.
- Remove JSON-RPC batching on revisions where it is not supported.

### Phase 4 — external-client certification

Test:

- authorization discovery;
- first connection;
- token refresh and revocation;
- scope denial;
- read/write tool selection;
- approval pause/resume;
- idempotent replay;
- connection removal;
- membership and role changes;
- malformed and prompt-injected tool arguments.

Run against at least two real clients. Keep client-specific workarounds isolated and documented.

### Phase 5 — optional app UI and directory submission

Only after tool-only retention:

- add a small interactive “weekly loop” or approval UI where supported;
- prepare privacy policy, support contact, test instructions, screenshots, and directory metadata;
- submit to relevant directories;
- preserve the same backend and permission model.

## Verification

Minimum:

- focused OAuth unit and contract tests;
- MCP protocol/transport tests for negotiated revisions;
- permission matrix tests by role and project membership;
- token expiry, rotation, revocation, reuse, and audience tests;
- idempotency/concurrency tests for every write tool;
- approval lifecycle tests;
- Doc proposal/reconciliation tests;
- full API test suite;
- web typecheck and focused Settings UI tests;
- external client smoke checklist.

Repository commands:

- `pnpm test:api`
- `pnpm --filter=web check:types`
- `pnpm --filter=web test:unit`
- `pnpm check`

## Rollout

1. Internal/self-host test with pre-registered clients.
2. Five design partners behind a workspace allowlist.
3. Paid/private beta with connection limits.
4. Broader Cloud availability.
5. Directory submission after retention and incident-response readiness.

Provide a kill switch by client and globally. Revocation must stop new calls immediately without requiring a deployment.

## Risks and mitigations

| Risk                                                          | Mitigation                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Prompt injection causes unsafe writes                         | Narrow tools, object permissions, approval policies, structured validation, no destructive V1 actions |
| OAuth implementation errors                                   | Standards-based metadata/PKCE, threat model, focused security review, hashed tokens, short lifetimes  |
| External AI replaces DragonFruit rather than strengthening it | Measure workflow completion and retained workspaces, not external call volume                         |
| Tool catalog becomes a second API                             | Canonical domain services reused by REST, Atlas, and MCP                                              |
| Collaborative Doc corruption                                  | Proposal/review or proven reconciliation only; no raw database replacement                            |
| Client protocol drift                                         | Revision negotiation, conformance tests, isolated compatibility adapters                              |
| User misunderstands data sharing                              | Plain-language consent and per-connection activity visibility                                         |

## External standards and product references

- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP 2025-06-18 changes](https://modelcontextprotocol.io/specification/2025-06-18/changelog)
- [OpenAI: developer mode and MCP apps](https://help.openai.com/en/articles/12584461)
- [OpenAI: Apps SDK introduction](https://openai.com/index/introducing-apps-in-chatgpt/)

Treat external platform availability and submission requirements as release-time facts. Re-verify the official documentation immediately before implementation and submission.
