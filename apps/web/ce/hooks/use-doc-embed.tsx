/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  TChartEmbedConfig,
  TDocEmbedConfig,
  TDocEmbedInsertAttrs,
  TDocEmbedPickerMode,
  TDocEmbedPickerRequest,
  TDocEmbedType,
} from "@plane/editor";
import { DEFAULT_CHART_SPEC } from "@/components/chart/spec";
import { DocChartEmbed } from "@/components/editor/embeds/chart/chart-embed";
import { DocEmbedCard, DocEmbedPicker, WhiteboardEmbed } from "@/components/editor/embeds/doc-embed";

type Props = {
  projectId?: string;
  workspaceSlug?: string;
};

type ActivePicker = {
  embedType: TDocEmbedType;
  mode: TDocEmbedPickerMode;
} | null;

const makeWidgetCallback =
  <T extends TDocEmbedType>(embedType: T): NonNullable<TDocEmbedConfig<T>["widgetCallback"]> =>
  ({ entityId, projectId, workspaceSlug, title, snapshot }) => (
    <DocEmbedCard
      embedType={embedType}
      entityId={entityId}
      projectId={projectId}
      workspaceSlug={workspaceSlug}
      title={title}
      snapshot={snapshot}
    />
  );

export const useDocEmbed = ({ projectId, workspaceSlug }: Props) => {
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const insertRef = useRef<((attrs: TDocEmbedInsertAttrs) => void) | null>(null);

  const onPickerRequest = useCallback((request: TDocEmbedPickerRequest) => {
    insertRef.current = request.insertEmbed;
    setActivePicker({ embedType: request.embedType, mode: request.mode });
  }, []);

  const closePicker = useCallback(() => {
    setActivePicker(null);
    insertRef.current = null;
  }, []);

  const handleInsert = useCallback(
    (attrs: TDocEmbedInsertAttrs) => {
      insertRef.current?.(attrs);
      closePicker();
    },
    [closePicker]
  );

  const whiteboardEmbedProps: TDocEmbedConfig<"whiteboard"> = useMemo(
    () => ({
      // Whiteboards render as native inline canvases, not link cards.
      widgetCallback: ({ entityId, projectId: embedProjectId, workspaceSlug: embedWorkspaceSlug, title, isEditable }) => (
        <WhiteboardEmbed
          entityId={entityId}
          projectId={embedProjectId}
          workspaceSlug={embedWorkspaceSlug}
          title={title}
          isEditable={isEditable}
        />
      ),
      onPickerRequest,
      workspaceSlug,
      projectId,
    }),
    [onPickerRequest, projectId, workspaceSlug]
  );

  const stickyEmbedProps: TDocEmbedConfig<"sticky"> = useMemo(
    () => ({
      widgetCallback: makeWidgetCallback("sticky"),
      onPickerRequest,
      workspaceSlug,
      projectId,
    }),
    [onPickerRequest, projectId, workspaceSlug]
  );

  const taskViewEmbedProps: TDocEmbedConfig<"task_view"> = useMemo(
    () => ({
      widgetCallback: makeWidgetCallback("task_view"),
      onPickerRequest,
      workspaceSlug,
      projectId,
    }),
    [onPickerRequest, projectId, workspaceSlug]
  );

  const googleDriveEmbedProps: TDocEmbedConfig<"google_drive"> = useMemo(
    () => ({
      widgetCallback: makeWidgetCallback("google_drive"),
      onPickerRequest,
      workspaceSlug,
      projectId,
    }),
    [onPickerRequest, projectId, workspaceSlug]
  );

  const chartEmbedProps: TChartEmbedConfig = useMemo(
    () => ({
      widgetCallback: ({ chart, isEditable, updateChart, deleteChart }) => (
        <DocChartEmbed chart={chart} isEditable={isEditable} updateChart={updateChart} deleteChart={deleteChart} />
      ),
      defaultChart: DEFAULT_CHART_SPEC,
    }),
    []
  );

  const renderPicker = useCallback(
    () =>
      activePicker ? (
        <DocEmbedPicker
          isOpen
          mode={activePicker.mode}
          embedType={activePicker.embedType}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          onClose={closePicker}
          onInsert={handleInsert}
        />
      ) : null,
    [activePicker, closePicker, handleInsert, projectId, workspaceSlug]
  );

  return {
    whiteboardEmbedProps,
    stickyEmbedProps,
    taskViewEmbedProps,
    googleDriveEmbedProps,
    chartEmbedProps,
    renderPicker,
  };
};
