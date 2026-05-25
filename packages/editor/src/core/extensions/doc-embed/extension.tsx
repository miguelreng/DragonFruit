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
}: {
  config: Props["configs"][TDocEmbedType] | undefined;
  embedType: TDocEmbedType | undefined;
  attrs: TDocEmbedAttributes;
}) {
  if (!embedType || !config?.widgetCallback) {
    return (
      <div className="not-prose rounded-md border border-subtle bg-surface-1 px-4 py-3 text-13 text-secondary">
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
  });
}
