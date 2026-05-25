/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TCustomFieldType = "text" | "number" | "date" | "boolean" | "select" | "multi_select";

export interface IProjectCustomField {
  id: string;
  project_id: string;
  workspace_id: string;
  name: string;
  field_type: TCustomFieldType;
  config: {
    options?: string[];
    [key: string]: unknown;
  };
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}
