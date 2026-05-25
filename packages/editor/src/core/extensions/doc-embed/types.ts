/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TDocEmbedType } from "@/plane-editor/types/issue-embed";

export enum EDocEmbedAttributeNames {
  EMBED_TYPE = "embed_type",
  ENTITY_IDENTIFIER = "entity_identifier",
  PROJECT_IDENTIFIER = "project_identifier",
  WORKSPACE_IDENTIFIER = "workspace_identifier",
  TITLE = "title",
  SNAPSHOT = "snapshot",
}

export type TDocEmbedAttributes = {
  [EDocEmbedAttributeNames.EMBED_TYPE]: TDocEmbedType | undefined;
  [EDocEmbedAttributeNames.ENTITY_IDENTIFIER]: string | undefined;
  [EDocEmbedAttributeNames.PROJECT_IDENTIFIER]: string | undefined;
  [EDocEmbedAttributeNames.WORKSPACE_IDENTIFIER]: string | undefined;
  [EDocEmbedAttributeNames.TITLE]: string | undefined;
  [EDocEmbedAttributeNames.SNAPSHOT]: unknown;
};
