/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum EWorkItemEmbedAttributeNames {
  ID = "id",
  ENTITY_IDENTIFIER = "entity_identifier",
  PROJECT_IDENTIFIER = "project_identifier",
  WORKSPACE_IDENTIFIER = "workspace_identifier",
  ENTITY_NAME = "entity_name",
  DRAFT = "draft",
  DRAFT_TITLE = "draft_title",
  DRAFT_DESCRIPTION = "draft_description",
}

export type TWorkItemEmbedAttributes = {
  [EWorkItemEmbedAttributeNames.ID]: string | undefined;
  [EWorkItemEmbedAttributeNames.ENTITY_IDENTIFIER]: string | undefined;
  [EWorkItemEmbedAttributeNames.PROJECT_IDENTIFIER]: string | undefined;
  [EWorkItemEmbedAttributeNames.WORKSPACE_IDENTIFIER]: string | undefined;
  [EWorkItemEmbedAttributeNames.ENTITY_NAME]: string | undefined;
  [EWorkItemEmbedAttributeNames.DRAFT]: boolean | undefined;
  [EWorkItemEmbedAttributeNames.DRAFT_TITLE]: string | undefined;
  [EWorkItemEmbedAttributeNames.DRAFT_DESCRIPTION]: string | undefined;
};
