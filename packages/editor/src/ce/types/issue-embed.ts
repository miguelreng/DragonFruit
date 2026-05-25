/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TEmbedConfig = {
  issue?: TIssueEmbedConfig;
  whiteboard?: TDocEmbedConfig<"whiteboard">;
  sticky?: TDocEmbedConfig<"sticky">;
  taskView?: TDocEmbedConfig<"task_view">;
  googleDrive?: TDocEmbedConfig<"google_drive">;
};

export type TReadOnlyEmbedConfig = TEmbedConfig;

export type TWorkItemEmbedInsertAttrs = {
  workItemId: string;
  projectId: string;
  workspaceSlug: string;
};

export type TWorkItemPickerMode = "embed" | "create";

export type TDocEmbedType = "whiteboard" | "sticky" | "task_view" | "google_drive";

export type TDocEmbedInsertAttrs = {
  embedType: TDocEmbedType;
  entityId: string;
  workspaceSlug: string;
  projectId?: string;
  title?: string;
  snapshot?: unknown;
};

export type TDocEmbedPickerMode = "embed" | "create";

export type TDocEmbedPickerRequest<T extends TDocEmbedType = TDocEmbedType> = {
  embedType: T;
  mode: TDocEmbedPickerMode;
  insertEmbed: (attrs: TDocEmbedInsertAttrs) => void;
};

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
  // Source context used by inline conversions (e.g. "Turn into task").
  workspaceSlug?: string;
  projectId?: string;
  // Creates a work item from a title in the doc's project. Resolves null on failure.
  onConvertToTask?: (params: { title: string; description?: string }) => Promise<TWorkItemEmbedInsertAttrs | null>;
};

export type TDocEmbedConfig<T extends TDocEmbedType = TDocEmbedType> = {
  widgetCallback: (args: {
    embedType: T;
    entityId: string;
    projectId: string | undefined;
    workspaceSlug: string | undefined;
    title: string | undefined;
    snapshot: unknown;
  }) => React.ReactNode;
  onPickerRequest?: (request: TDocEmbedPickerRequest<T>) => void;
  workspaceSlug?: string;
  projectId?: string;
};
