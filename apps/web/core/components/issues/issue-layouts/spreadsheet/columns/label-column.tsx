/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// types
import type { TIssue } from "@plane/types";
// hooks
import { useLabel } from "@/hooks/store/use-label";
// components
import { IssuePropertyLabels } from "../../properties";

type Props = {
  issue: TIssue;
  onClose: () => void;
  onChange: (issue: TIssue, data: Partial<TIssue>, updates: any) => void;
  disabled: boolean;
};

export const SpreadsheetLabelColumn = observer(function SpreadsheetLabelColumn(props: Props) {
  const { issue, onChange, disabled, onClose } = props;
  // hooks
  const { labelMap } = useLabel();

  const defaultLabelOptions = issue?.label_ids?.map((id) => labelMap[id]) || [];

  return (
    // The whole cell is one clickable dropdown (like the priority/state cells);
    // the trigger shows left-aligned inline pills.
    <div className="h-9 w-full border-b-[0.5px] border-subtle">
      <IssuePropertyLabels
        projectId={issue.project_id ?? null}
        value={issue.label_ids || []}
        defaultOptions={defaultLabelOptions}
        onChange={(data) => onChange(issue, { label_ids: data }, { changed_property: "labels", change_details: data })}
        buttonClassName="h-full w-full justify-start gap-1 overflow-hidden rounded-none px-page-x pr-0 group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10"
        hideDropdownArrow
        maxRender={50}
        disabled={disabled}
        // Unset cells render blank (no icon, no placeholder text) but stay clickable.
        placeholderText=""
        hidePlaceholderIcon
        placeholderClassName="!text-13 w-full justify-start font-normal"
        onClose={onClose}
        noLabelBorder
        fullWidth
        fullHeight
      />
    </div>
  );
});
