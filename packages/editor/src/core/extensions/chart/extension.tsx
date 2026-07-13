/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
// types
import type { TChartEmbedConfig } from "@/plane-editor/types/issue-embed";
// local imports
import { ChartExtensionConfig } from "./extension-config";

type Props = {
  config: TChartEmbedConfig;
};

export function ChartExtension(props: Props) {
  return ChartExtensionConfig.extend({
    addNodeView() {
      return ReactNodeViewRenderer((nodeViewProps: NodeViewProps) => (
        <NodeViewWrapper className="chart-component">
          {props.config.widgetCallback({
            chart: nodeViewProps.node.attrs.chart,
            isEditable: nodeViewProps.editor.isEditable,
            updateChart: (chart) => nodeViewProps.updateAttributes({ chart }),
            deleteChart: () => nodeViewProps.deleteNode(),
          })}
        </NodeViewWrapper>
      ));
    },
  });
}
