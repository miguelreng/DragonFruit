/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR } from "@plane/types";
// local imports
import type { IFilterIconConfig, TCreateFilterConfig, TCreateFilterConfigParams } from "../../../rich-filters";
import { createFilterConfig, createOperatorConfigEntry, getMultiSelectConfig } from "../../../rich-filters";

// ------------ Relation label filter ------------

/**
 * Params for the relation-label filter. Takes a flat list of distinct
 * labels that exist across IssueRelation rows in the current workspace —
 * the consumer fetches these from `GET /workspaces/<slug>/relation-labels/`
 * once and passes them in.
 */
// The icon config is parameterized over `undefined` because the relation-label
// items don't have per-option icons — just text. `filterIcon` (the icon shown
// next to "Relation label" in the dropdown header) still needs to be a prop.
export type TCreateRelationLabelFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<undefined> & {
    labels: string[];
  };

/**
 * Multi-select picker over the distinct custom_label values.
 *
 * Item shape is `{ id, label }` because the filter system's getMultiSelectConfig
 * needs an explicit id/label/value extractor — we use the label string itself
 * as the id (the labels are unique by definition of "distinct").
 */
export const getRelationLabelMultiSelectConfig = (params: TCreateRelationLabelFilterParams) =>
  getMultiSelectConfig<{ id: string; label: string }, string, undefined>(
    {
      items: params.labels.map((label) => ({ id: label, label })),
      getId: (item) => item.id,
      getLabel: (item) => item.label,
      getValue: (item) => item.id,
      // No per-option icon — labels are plain text.
      getIconData: () => undefined,
    },
    {
      singleValueOperator: EQUALITY_OPERATOR.EXACT,
      ...params,
    },
    {
      ...params,
    }
  );

/**
 * Get the relation-label filter config. Renders only when the picker has
 * at least one label to choose from — the consumer should pass an empty
 * array (or skip enabling the filter) when the workspace has no labeled
 * relations yet.
 */
export const getRelationLabelFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateRelationLabelFilterParams> =>
  (params: TCreateRelationLabelFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Relation label",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getRelationLabelMultiSelectConfig(updatedParams)
        ),
      ]),
    });
