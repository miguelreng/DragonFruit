/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueRelation, TIssue } from "@plane/types";
// helpers
// DragonFruit-web
import type { TIssueRelationTypes } from "@/plane-web/types";
// services
import { APIService } from "@/services/api.service";

export class IssueRelationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listIssueRelations(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueRelation> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/issue-relation/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueRelations(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    // `custom_label` is optional — when set, the server stores it on the
    // IssueRelation row and the client uses it as the display name in place
    // of the hard-coded relation_type label.
    data: { relation_type: TIssueRelationTypes; issues: string[]; custom_label?: string }
  ): Promise<TIssue[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/issue-relation/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listWorkspaceRelationLabels(workspaceSlug: string): Promise<string[]> {
    // Feeds the rich-filters "Relation label" picker. Server returns the
    // distinct custom_label strings used across all IssueRelations in the
    // workspace, alphabetically.
    return this.get(`/api/workspaces/${workspaceSlug}/relation-labels/`)
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueRelationLabel(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    // `related_issue` identifies the row to update — the relation between
    // any two issues is unique. Empty string clears the label.
    data: { related_issue: string; custom_label: string }
  ): Promise<{ custom_label: string | null }> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/update-relation-label/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueRelation(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { relation_type: TIssueRelationTypes; related_issue: string }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/remove-relation/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
