/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { AnyExtension } from "@tiptap/core";
import { SlashCommands, WorkItemEmbedExtension } from "@/extensions";
// types
import type { IEditorProps, TUserDetails } from "@/types";

export type TDocumentEditorAdditionalExtensionsProps = Pick<
  IEditorProps,
  "disabledExtensions" | "flaggedExtensions" | "fileHandler" | "extendedEditorProps" | "embedConfig"
> & {
  isEditable: boolean;
  provider?: HocuspocusProvider;
  userDetails: TUserDetails;
};

export type TDocumentEditorAdditionalExtensionsRegistry = {
  isEnabled: (props: TDocumentEditorAdditionalExtensionsProps) => boolean;
  getExtension: (props: TDocumentEditorAdditionalExtensionsProps) => AnyExtension;
};

const extensionRegistry: TDocumentEditorAdditionalExtensionsRegistry[] = [
  {
    isEnabled: ({ disabledExtensions }) => !disabledExtensions.includes("slash-commands"),
    getExtension: ({ disabledExtensions, embedConfig, flaggedExtensions }) =>
      SlashCommands({ disabledExtensions, embedConfig, flaggedExtensions }),
  },
  {
    isEnabled: ({ embedConfig }) => Boolean(embedConfig?.issue?.widgetCallback),
    getExtension: ({ embedConfig }) =>
      WorkItemEmbedExtension({
        // Guarded by isEnabled — widgetCallback is guaranteed defined here.
        widgetCallback: embedConfig!.issue!.widgetCallback,
      }),
  },
];

export function DocumentEditorAdditionalExtensions(props: TDocumentEditorAdditionalExtensionsProps) {
  const documentExtensions = extensionRegistry
    .filter((config) => config.isEnabled(props))
    .map((config) => config.getExtension(props));

  return documentExtensions;
}
