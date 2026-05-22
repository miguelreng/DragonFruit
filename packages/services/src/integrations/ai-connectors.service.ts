/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  IAIConnector,
  IAIConnectorCreatePayload,
  IAIConnectorEvent,
  IAIConnectorIngestMessage,
  IAIConnectorIngestResult,
  IAIConnectorUpdatePayload,
} from "@plane/types";
import { APIService } from "../api.service";

export class AIConnectorService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<IAIConnector[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/ai-connectors/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: IAIConnectorCreatePayload): Promise<IAIConnector> {
    return this.post(`/api/workspaces/${workspaceSlug}/integrations/ai-connectors/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    connectorId: string,
    payload: IAIConnectorUpdatePayload
  ): Promise<IAIConnector> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/integrations/ai-connectors/${connectorId}/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, connectorId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/integrations/ai-connectors/${connectorId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async ingest(
    workspaceSlug: string,
    payload: IAIConnectorIngestMessage,
    idempotencyKey: string
  ): Promise<IAIConnectorIngestResult> {
    return this.post(`/api/workspaces/${workspaceSlug}/integrations/ai-connectors/ingest/`, payload, {
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async events(workspaceSlug: string, connectorId: string): Promise<IAIConnectorEvent[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/ai-connectors/${connectorId}/events/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async testConnection(workspaceSlug: string, connectorId: string): Promise<{ ok: boolean }> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/integrations/ai-connectors/${connectorId}/test/`,
      {}
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
