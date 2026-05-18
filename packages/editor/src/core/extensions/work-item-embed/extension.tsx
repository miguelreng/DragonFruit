/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
// local imports
import { WorkItemEmbedExtensionConfig } from "./extension-config";
import type { TWorkItemEmbedAttributes } from "./types";
import { EWorkItemEmbedAttributeNames } from "./types";

type Props = {
  widgetCallback: ({
    issueId,
    projectId,
    workspaceSlug,
    draft,
    draftTitle,
    draftDescription,
    promote,
  }: {
    issueId: string;
    projectId: string | undefined;
    workspaceSlug: string | undefined;
    draft: boolean;
    draftTitle: string | undefined;
    draftDescription: string | undefined;
    promote: (attrs: { workItemId: string; projectId: string; workspaceSlug: string }) => void;
  }) => React.ReactNode;
};

export function WorkItemEmbedExtension(props: Props) {
  return WorkItemEmbedExtensionConfig.extend({
    addNodeView() {
      return ReactNodeViewRenderer((issueProps: NodeViewProps) => {
        const attrs = issueProps.node.attrs as TWorkItemEmbedAttributes;
        const promote: Parameters<typeof props.widgetCallback>[0]["promote"] = (next) => {
          issueProps.updateAttributes({
            [EWorkItemEmbedAttributeNames.DRAFT]: false,
            [EWorkItemEmbedAttributeNames.DRAFT_TITLE]: undefined,
            [EWorkItemEmbedAttributeNames.DRAFT_DESCRIPTION]: undefined,
            [EWorkItemEmbedAttributeNames.ENTITY_IDENTIFIER]: next.workItemId,
            [EWorkItemEmbedAttributeNames.PROJECT_IDENTIFIER]: next.projectId,
            [EWorkItemEmbedAttributeNames.WORKSPACE_IDENTIFIER]: next.workspaceSlug,
            [EWorkItemEmbedAttributeNames.ENTITY_NAME]: "work_item",
          });
        };
        return (
          <NodeViewWrapper key={attrs[EWorkItemEmbedAttributeNames.ID]}>
            {props.widgetCallback({
              issueId: attrs[EWorkItemEmbedAttributeNames.ENTITY_IDENTIFIER] ?? "",
              projectId: attrs[EWorkItemEmbedAttributeNames.PROJECT_IDENTIFIER],
              workspaceSlug: attrs[EWorkItemEmbedAttributeNames.WORKSPACE_IDENTIFIER],
              draft: attrs[EWorkItemEmbedAttributeNames.DRAFT] === true,
              draftTitle: attrs[EWorkItemEmbedAttributeNames.DRAFT_TITLE],
              draftDescription: attrs[EWorkItemEmbedAttributeNames.DRAFT_DESCRIPTION],
              promote,
            })}
          </NodeViewWrapper>
        );
      });
    },
  });
}
