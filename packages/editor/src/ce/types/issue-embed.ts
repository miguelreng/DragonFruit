/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TEmbedConfig = {
  issue?: TIssueEmbedConfig;
};

export type TReadOnlyEmbedConfig = TEmbedConfig;

export type TWorkItemEmbedInsertAttrs = {
  workItemId: string;
  projectId: string;
  workspaceSlug: string;
};

export type TWorkItemPickerMode = "embed" | "create";

export type TWorkItemPickerRequest = {
  mode: TWorkItemPickerMode;
  insertEmbed: (attrs: TWorkItemEmbedInsertAttrs) => void;
};

export type TIssueEmbedConfig = {
  widgetCallback: (args: {
    issueId: string;
    projectId: string | undefined;
    workspaceSlug: string | undefined;
    draft: boolean;
    draftTitle: string | undefined;
    draftDescription: string | undefined;
    promote: (attrs: TWorkItemEmbedInsertAttrs) => void;
  }) => React.ReactNode;
  onPickerRequest?: (request: TWorkItemPickerRequest) => void;
  onTranscriptRequest?: () => void;
};
