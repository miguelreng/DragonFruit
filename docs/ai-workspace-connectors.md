# AI Workspace Connectors (Claude / ChatGPT / OpenClaw / Hermes)

This document defines a provider-agnostic connector model so users can connect their AI workspace and send content into DragonFruit workspaces.

## Proposed package layout

- `packages/types/src/ai-connectors.ts`
  - Shared contracts for providers, connector records, inbound payloads, and event status.
- `packages/services/src/integrations/ai-connectors.service.ts`
  - Frontend service client for connector CRUD, ingest trigger, event feed, and connection test.
- `apps/api` (to be implemented)
  - Backend endpoints, auth verification, signature checks, queueing, and idempotent processing.

## Internal normalized message schema

`IAIConnectorIngestMessage` is the canonical ingest payload:

- `workspace_id`
- `user_id`
- `source` (`claude` | `chatgpt` | `openclaw` | `hermes`)
- `source_message_id`
- `source_workspace_id`
- `source_conversation_id` (optional)
- `content`
- `attachments[]`
- `metadata`
- `timestamp`
- `actor`

Use idempotency key format:

- `${source}:${source_message_id}`

Send as header:

- `Idempotency-Key`

## Suggested backend endpoints

Workspace-scoped endpoints:

- `GET /api/workspaces/:workspaceSlug/integrations/ai-connectors/`
- `POST /api/workspaces/:workspaceSlug/integrations/ai-connectors/`
- `PATCH /api/workspaces/:workspaceSlug/integrations/ai-connectors/:connectorId/`
- `DELETE /api/workspaces/:workspaceSlug/integrations/ai-connectors/:connectorId/`
- `POST /api/workspaces/:workspaceSlug/integrations/ai-connectors/:connectorId/test/`
- `GET /api/workspaces/:workspaceSlug/integrations/ai-connectors/:connectorId/events/`
- `POST /api/workspaces/:workspaceSlug/integrations/ai-connectors/ingest/`

Provider webhook endpoints (optional split):

- `POST /api/integrations/inbound/claude/`
- `POST /api/integrations/inbound/chatgpt/`
- `POST /api/integrations/inbound/openclaw/`
- `POST /api/integrations/inbound/hermes/`

Provider endpoints should verify source signatures/tokens and map payloads into `IAIConnectorIngestMessage` before passing to ingest.

## Security requirements

- Encrypt connector secrets with KMS-managed keys.
- Store secrets server-side only; never return raw secrets after create.
- Verify webhook HMAC signatures where supported.
- Enforce workspace RBAC for who can create/update/revoke connectors.
- Log all actions into audit trail (`connect`, `revoke`, `ingest`, `delivery-failed`).
- Rate-limit inbound endpoints per connector and provider.

## Processing model

- Accept inbound payload and quickly enqueue.
- Persist `dedupe_key` with unique constraint.
- Async worker resolves target routing and writes DragonFruit entity.
- Keep event timeline in `IAIConnectorEvent` for UI observability.
- Move failed jobs to DLQ with retry metadata.

## UI flow in admin/space apps

- Integrations screen per workspace:
  - Connect provider
  - Choose default target (workspace/project/channel)
  - Send test
  - View event status and last error
  - Pause/revoke connector

## Delivery phases

1. Implement backend models + endpoint stubs + idempotency store.
2. Ship ChatGPT + Claude adapters first.
3. Add queue worker + DLQ + observability.
4. Add OpenClaw + Hermes adapters.
5. Add outbound fan-out (DragonFruit -> provider) if needed.
