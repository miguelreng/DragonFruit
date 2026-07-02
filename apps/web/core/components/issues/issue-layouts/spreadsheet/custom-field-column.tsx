/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { observer } from "mobx-react";
// types
import type { IProjectCustomField, TIssue } from "@plane/types";
// ui
import { CustomSelect } from "@plane/ui";

type Props = {
  customField: IProjectCustomField;
  issue: TIssue;
  disabled: boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
};

// A single custom-field value cell in the spreadsheet. Mirrors the sidebar
// editor in ce/.../additional-properties.tsx but styled to fill a grid cell.
// It merges the new value into the issue's custom_field_values JSON blob.
export const CustomFieldColumn = observer(function CustomFieldColumn(props: Props) {
  const { customField, issue, disabled, updateIssue } = props;

  const currentValues = issue.custom_field_values ?? {};
  const value = currentValues[customField.id];
  const options = customField.config?.options ?? [];

  const handleChange = useCallback(
    (nextValue: unknown) => {
      if (disabled || !updateIssue) return;
      void updateIssue(issue.project_id, issue.id, {
        custom_field_values: { ...currentValues, [customField.id]: nextValue },
      });
    },
    [disabled, updateIssue, issue.project_id, issue.id, currentValues, customField.id]
  );

  // Shared classes for the borderless, cell-filling inputs.
  const inputClassName =
    "h-full w-full bg-transparent px-page-x text-13 text-primary outline-none placeholder:text-placeholder disabled:cursor-not-allowed";

  if (customField.field_type === "boolean") {
    return (
      <div className="flex h-full w-full items-center px-page-x">
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.checked)}
          className="size-3.5"
        />
      </div>
    );
  }

  if (customField.field_type === "select") {
    return (
      <CustomSelect
        value={typeof value === "string" ? value : ""}
        onChange={(val: string) => handleChange(val || null)}
        disabled={disabled}
        customButtonClassName="h-full w-full"
        customButton={
          <div className="flex h-9 w-full items-center px-page-x text-13">
            {typeof value === "string" && value ? (
              <span className="truncate text-primary">{value}</span>
            ) : (
              <span className="text-placeholder">—</span>
            )}
          </div>
        }
        optionsClassName="w-48"
      >
        <CustomSelect.Option value="">
          <span className="text-tertiary">None</span>
        </CustomSelect.Option>
        {options.map((option) => (
          <CustomSelect.Option key={option} value={option}>
            {option}
          </CustomSelect.Option>
        ))}
      </CustomSelect>
    );
  }

  if (customField.field_type === "multi_select") {
    const selectedValues = Array.isArray(value) ? (value as string[]) : [];
    return (
      <CustomSelect
        value=""
        onChange={(val: string) => {
          if (!val) return;
          if (selectedValues.includes(val)) handleChange(selectedValues.filter((item) => item !== val));
          else handleChange([...selectedValues, val]);
        }}
        disabled={disabled}
        customButtonClassName="h-full w-full"
        customButton={
          <div className="flex h-9 w-full items-center px-page-x text-13">
            {selectedValues.length > 0 ? (
              <span className="truncate text-primary">{selectedValues.join(", ")}</span>
            ) : (
              <span className="text-placeholder">—</span>
            )}
          </div>
        }
        optionsClassName="w-48"
      >
        {options.map((option) => (
          <CustomSelect.Option key={option} value={option}>
            <div className="flex items-center justify-between gap-2">
              <span>{option}</span>
              {selectedValues.includes(option) && <span className="text-11 text-tertiary">Selected</span>}
            </div>
          </CustomSelect.Option>
        ))}
      </CustomSelect>
    );
  }

  if (customField.field_type === "date") {
    return (
      <input
        type="date"
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.value || null)}
        className={inputClassName}
      />
    );
  }

  if (customField.field_type === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? String(value) : ""}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.value === "" ? null : Number(e.target.value))}
        className={inputClassName}
        placeholder="—"
      />
    );
  }

  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value || null)}
      className={inputClassName}
      placeholder="—"
    />
  );
});
