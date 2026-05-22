/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const AI_CONNECTOR_PROVIDERS = ["claude", "chatgpt", "openclaw", "hermes"] as const;

export type TAIConnectorProvider = (typeof AI_CONNECTOR_PROVIDERS)[number];

export type TAIConnectorAuthMode = "oauth" | "api_key" | "token";

export type TAIConnectorStatus = "active" | "paused" | "revoked" | "error";

export interface IAIConnectorTarget {
  id: string;
  name: string;
  type: "workspace" | "project" | "channel";
}

export interface IAIConnector {
  id: string;
  workspace: string;
  provider: TAIConnectorProvider;
  status: TAIConnectorStatus;
  auth_mode: TAIConnectorAuthMode;
  external_workspace_id: string;
  external_workspace_name: string;
  external_user_id: string;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
  last_error: string | null;
  default_target: IAIConnectorTarget | null;
  metadata: Record<string, unknown>;
}

export interface IAIConnectorCreatePayload {
  provider: TAIConnectorProvider;
  auth_mode: TAIConnectorAuthMode;
  external_workspace_id: string;
  external_workspace_name?: string;
  external_user_id: string;
  secret: string;
  default_target_id?: string;
  default_target_type?: IAIConnectorTarget["type"];
}

export interface IAIConnectorUpdatePayload {
  status?: TAIConnectorStatus;
  default_target_id?: string | null;
  default_target_type?: IAIConnectorTarget["type"] | null;
  metadata?: Record<string, unknown>;
}

export interface IAIConnectorIngestAttachment {
  url?: string;
  mime_type: string;
  filename: string;
  size_bytes?: number;
}

export interface IAIConnectorIngestActor {
  id: string;
  email?: string;
  name?: string;
}

export interface IAIConnectorIngestMessage {
  workspace_id: string;
  user_id: string;
  source: TAIConnectorProvider;
  source_message_id: string;
  source_workspace_id: string;
  source_conversation_id?: string;
  content: string;
  attachments: IAIConnectorIngestAttachment[];
  metadata: Record<string, unknown>;
  timestamp: string;
  actor: IAIConnectorIngestActor;
}

export interface IAIConnectorIngestResult {
  id: string;
  dedupe_key: string;
  accepted: boolean;
  enqueued: boolean;
  created_at: string;
}

export interface IAIConnectorEvent {
  id: string;
  workspace: string;
  connector: string;
  provider: TAIConnectorProvider;
  source_message_id: string;
  dedupe_key: string;
  status: "received" | "processing" | "processed" | "failed";
  error: string | null;
  created_at: string;
  updated_at: string;
}
