/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef, useState } from "react";
// editor
import type {
  TEmbedConfig,
  TWorkItemEmbedInsertAttrs,
  TWorkItemPickerMode,
  TWorkItemPickerRequest,
} from "@plane/editor";
// plane types
import type { TSearchEntityRequestPayload, TSearchResponse } from "@plane/types";
// plane web components
import { IssueEmbedCard } from "@/plane-web/components/pages";
// components
import { TranscriptSpecModal } from "@/components/editor/embeds/transcript-spec";
import { WorkItemPicker } from "@/components/editor/embeds/work-item-picker";
// services
import { IssueService } from "@/services/issue";

const issueService = new IssueService();

export type TIssueEmbedHookProps = {
  fetchEmbedSuggestions?: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
  projectId?: string;
  workspaceSlug?: string;
  /** Called when the user generates a spec from a transcript; host should insert the JSON via the editor. */
  onInsertGeneratedContent?: (doc: object) => void;
};

const widgetCallback: NonNullable<TEmbedConfig["issue"]>["widgetCallback"] = ({
  issueId,
  projectId,
  workspaceSlug,
  draft,
  draftTitle,
  draftDescription,
  promote,
}) => (
  <IssueEmbedCard
    issueId={issueId}
    projectId={projectId}
    workspaceSlug={workspaceSlug}
    draft={draft}
    draftTitle={draftTitle}
    draftDescription={draftDescription}
    onPromoted={promote}
  />
);

export const useIssueEmbed = (props: TIssueEmbedHookProps) => {
  const { fetchEmbedSuggestions, projectId, workspaceSlug, onInsertGeneratedContent } = props;
  const [pickerMode, setPickerMode] = useState<TWorkItemPickerMode | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const insertRef = useRef<TWorkItemPickerRequest["insertEmbed"] | null>(null);

  const onPickerRequest = useCallback((request: TWorkItemPickerRequest) => {
    insertRef.current = request.insertEmbed;
    setPickerMode(request.mode);
  }, []);

  const onTranscriptRequest = useCallback(() => {
    setIsTranscriptOpen(true);
  }, []);

  const closePicker = useCallback(() => {
    setPickerMode(null);
    insertRef.current = null;
  }, []);

  const closeTranscript = useCallback(() => {
    setIsTranscriptOpen(false);
  }, []);

  const handleInsert = useCallback((attrs: TWorkItemEmbedInsertAttrs) => {
    insertRef.current?.(attrs);
  }, []);

  const handleInsertGenerated = useCallback(
    (doc: object) => {
      onInsertGeneratedContent?.(doc);
    },
    [onInsertGeneratedContent]
  );

  const onConvertToTask = useCallback(
    async ({
      title,
      description,
    }: {
      title: string;
      description?: string;
    }): Promise<TWorkItemEmbedInsertAttrs | null> => {
      if (!workspaceSlug || !projectId) return null;
      try {
        const issue = await issueService.createIssue(workspaceSlug, projectId, {
          name: title,
          description_html: description ? `<p>${description}</p>` : undefined,
        });
        return { workItemId: issue.id, projectId, workspaceSlug };
      } catch {
        return null;
      }
    },
    [workspaceSlug, projectId]
  );

  const issueEmbedProps: TEmbedConfig["issue"] = useMemo(
    () => ({
      widgetCallback,
      onPickerRequest,
      onTranscriptRequest,
      workspaceSlug,
      projectId,
      onConvertToTask,
    }),
    [onPickerRequest, onTranscriptRequest, workspaceSlug, projectId, onConvertToTask]
  );

  const renderPicker = useCallback(
    () => (
      <WorkItemPicker
        isOpen={pickerMode !== null}
        mode={pickerMode ?? "embed"}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        searchEntity={fetchEmbedSuggestions}
        onClose={closePicker}
        onInsert={handleInsert}
      />
    ),
    [pickerMode, workspaceSlug, projectId, fetchEmbedSuggestions, closePicker, handleInsert]
  );

  const renderTranscriptModal = useCallback(
    () => (
      <TranscriptSpecModal
        isOpen={isTranscriptOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onClose={closeTranscript}
        onInsert={handleInsertGenerated}
      />
    ),
    [isTranscriptOpen, workspaceSlug, projectId, closeTranscript, handleInsertGenerated]
  );

  return {
    issueEmbedProps,
    renderPicker,
    renderTranscriptModal,
  };
};
