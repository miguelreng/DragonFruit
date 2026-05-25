/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

export const DocEmbedExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.DOC_EMBED,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      embed_type: {
        default: undefined,
      },
      entity_identifier: {
        default: undefined,
      },
      project_identifier: {
        default: undefined,
      },
      workspace_identifier: {
        default: undefined,
      },
      title: {
        default: undefined,
      },
      snapshot: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute("snapshot");
          if (!raw) return undefined;
          try {
            return JSON.parse(raw);
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) => {
          if (attributes.snapshot === undefined) return {};
          return { snapshot: JSON.stringify(attributes.snapshot) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "doc-embed-component",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["doc-embed-component", mergeAttributes(HTMLAttributes)];
  },
});
