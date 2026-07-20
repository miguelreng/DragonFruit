/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
// types
import type { TDocEmbedConfig, TDocEmbedType } from "@/plane-editor/types/issue-embed";
// local imports
import { DocEmbedExtensionConfig } from "./extension-config";
import { EDocEmbedAttributeNames, type TDocEmbedAttributes } from "./types";

type Props = {
  configs: {
    whiteboard?: TDocEmbedConfig<"whiteboard">;
    sticky?: TDocEmbedConfig<"sticky">;
    task_view?: TDocEmbedConfig<"task_view">;
    google_drive?: TDocEmbedConfig<"google_drive">;
  };
};

export function DocEmbedExtension(props: Props) {
  return DocEmbedExtensionConfig.extend({
    addNodeView() {
      return ReactNodeViewRenderer((nodeViewProps: NodeViewProps) => {
        const attrs = nodeViewProps.node.attrs as TDocEmbedAttributes;
        const embedType = attrs[EDocEmbedAttributeNames.EMBED_TYPE];
        const config = embedType ? props.configs[embedType] : undefined;

        return (
          <NodeViewWrapper>
            {renderDocEmbedWidget({
              config,
              embedType,
              attrs,
              isEditable: nodeViewProps.editor.isEditable,
            })}
          </NodeViewWrapper>
        );
      });
    },
  });
}

function renderDocEmbedWidget({
  config,
  embedType,
  attrs,
  isEditable,
}: {
  config: Props["configs"][TDocEmbedType] | undefined;
  embedType: TDocEmbedType | undefined;
  attrs: TDocEmbedAttributes;
  isEditable: boolean;
}) {
  if (!embedType || !config?.widgetCallback) {
    return (
      <div className="not-prose rounded-lg border border-subtle bg-surface-1 px-4 py-3 text-13 text-secondary">
        Embedded content is unavailable.
      </div>
    );
  }

  if (embedType === "whiteboard") {
    const typedConfig = config as TDocEmbedConfig<"whiteboard">;
    return typedConfig.widgetCallback({
      embedType,
      entityId: attrs[EDocEmbedAttributeNames.ENTITY_IDENTIFIER] ?? "",
      projectId: attrs[EDocEmbedAttributeNames.PROJECT_IDENTIFIER],
      workspaceSlug: attrs[EDocEmbedAttributeNames.WORKSPACE_IDENTIFIER],
      title: attrs[EDocEmbedAttributeNames.TITLE],
      snapshot: attrs[EDocEmbedAttributeNames.SNAPSHOT],
      isEditable,
    });
  }
  if (embedType === "sticky") {
    const typedConfig = config as TDocEmbedConfig<"sticky">;
    return typedConfig.widgetCallback({
      embedType,
      entityId: attrs[EDocEmbedAttributeNames.ENTITY_IDENTIFIER] ?? "",
      projectId: attrs[EDocEmbedAttributeNames.PROJECT_IDENTIFIER],
      workspaceSlug: attrs[EDocEmbedAttributeNames.WORKSPACE_IDENTIFIER],
      title: attrs[EDocEmbedAttributeNames.TITLE],
      snapshot: attrs[EDocEmbedAttributeNames.SNAPSHOT],
      isEditable,
    });
  }
  if (embedType === "google_drive") {
    const typedConfig = config as TDocEmbedConfig<"google_drive">;
    return typedConfig.widgetCallback({
      embedType,
      entityId: attrs[EDocEmbedAttributeNames.ENTITY_IDENTIFIER] ?? "",
      projectId: attrs[EDocEmbedAttributeNames.PROJECT_IDENTIFIER],
      workspaceSlug: attrs[EDocEmbedAttributeNames.WORKSPACE_IDENTIFIER],
      title: attrs[EDocEmbedAttributeNames.TITLE],
      snapshot: attrs[EDocEmbedAttributeNames.SNAPSHOT],
      isEditable,
    });
  }
  const typedConfig = config as TDocEmbedConfig<"task_view">;
  return typedConfig.widgetCallback({
    embedType,
    entityId: attrs[EDocEmbedAttributeNames.ENTITY_IDENTIFIER] ?? "",
    projectId: attrs[EDocEmbedAttributeNames.PROJECT_IDENTIFIER],
    workspaceSlug: attrs[EDocEmbedAttributeNames.WORKSPACE_IDENTIFIER],
    title: attrs[EDocEmbedAttributeNames.TITLE],
    snapshot: attrs[EDocEmbedAttributeNames.SNAPSHOT],
    isEditable,
  });
}
