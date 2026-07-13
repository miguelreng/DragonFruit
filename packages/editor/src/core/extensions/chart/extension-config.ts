/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

/**
 * Schema-only chart block. The chart spec is an opaque JSON payload — the
 * host app owns its shape and supplies the renderer via `ChartExtension`'s
 * widget callback. Serializes to `<chart-component chart="{…}">` so charts
 * persist in description_html and survive the fallback (no-live-server)
 * editing path unchanged.
 */
export const ChartExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.CHART,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      chart: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute("chart");
          if (!raw) return undefined;
          try {
            return JSON.parse(raw);
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) => {
          if (attributes.chart === undefined) return {};
          return { chart: JSON.stringify(attributes.chart) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "chart-component",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["chart-component", mergeAttributes(HTMLAttributes)];
  },
});
