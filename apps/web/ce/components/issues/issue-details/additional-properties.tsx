/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import type { IProjectCustomField } from "@plane/types";
import { Plus, Pencil, Trash2, Hash } from "@/components/icons/lucide-shim";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { CreateUpdateCustomFieldModal } from "@/components/custom-fields";
import { useProjectCustomFields } from "@/hooks/use-project-custom-fields";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { ProjectCustomFieldService } from "@/services/project";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect } from "@plane/ui";

export type TWorkItemAdditionalSidebarProperties = {
  workItemId: string;
  workItemTypeId: string | null;
  projectId: string;
  workspaceSlug: string;
  isEditable: boolean;
  isPeekView?: boolean;
};

const customFieldService = new ProjectCustomFieldService();

const CustomValueEditor = observer(function CustomValueEditor({
  customField,
  value,
  disabled,
  onChange,
}: {
  customField: IProjectCustomField;
  value: unknown;
  disabled: boolean;
  onChange: (nextValue: unknown) => void;
}) {
  const options = customField.config?.options ?? [];

  if (customField.field_type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={!!value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
    );
  }

  if (customField.field_type === "select") {
    return (
      <CustomSelect
        value={typeof value === "string" ? value : ""}
        onChange={(val: string) => onChange(val || null)}
        input
        label={typeof value === "string" && value ? value : <span className="text-tertiary">Select option</span>}
        buttonClassName="w-full"
        optionsClassName="w-[var(--reference-width)] min-w-0"
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
          if (selectedValues.includes(val)) {
            onChange(selectedValues.filter((item) => item !== val));
            return;
          }
          onChange([...selectedValues, val]);
        }}
        input
        label={
          selectedValues.length > 0 ? (
            <span className="truncate">{selectedValues.join(", ")}</span>
          ) : (
            <span className="text-tertiary">Select options</span>
          )
        }
        buttonClassName="w-full"
        optionsClassName="w-[var(--reference-width)] min-w-0"
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
        onChange={(e) => onChange(e.target.value || null)}
        className="h-7 w-full rounded border border-subtle bg-layer-1 px-2 text-12"
      />
    );
  }

  if (customField.field_type === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? String(value) : ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="h-7 w-full rounded border border-subtle bg-layer-1 px-2 text-12"
      />
    );
  }

  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-7 w-full rounded border border-subtle bg-layer-1 px-2 text-12"
      placeholder="Add value"
    />
  );
});

export const WorkItemAdditionalSidebarProperties = observer(function WorkItemAdditionalSidebarProperties(
  props: TWorkItemAdditionalSidebarProperties
) {
  const { workItemId, projectId, workspaceSlug, isEditable } = props;
  const {
    issue: { getIssueById },
    updateIssue,
  } = useIssueDetail();
  const { customFields, refetchCustomFields } = useProjectCustomFields(workspaceSlug, projectId);
  const issue = getIssueById(workItemId);

  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [editingField, setEditingField] = React.useState<IProjectCustomField | null>(null);

  if (!issue) return <></>;

  const currentValues = issue.custom_field_values ?? {};

  const updateCustomFieldValue = async (fieldId: string, value: unknown) => {
    if (!isEditable) return;
    try {
      await updateIssue(workspaceSlug, projectId, workItemId, {
        custom_field_values: {
          ...currentValues,
          [fieldId]: value,
        },
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed to update custom field value.",
      });
    }
  };

  const handleDeleteField = async (field: IProjectCustomField) => {
    try {
      await customFieldService.remove(workspaceSlug, projectId, field.id);
      await refetchCustomFields();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Custom field deleted." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Failed to delete custom field." });
    }
  };

  return (
    <>
      <div className="mt-3 space-y-3">
        {customFields.map((field) => (
          <SidebarPropertyListItem
            key={field.id}
            icon={Hash}
            label={field.name}
            appendElement={
              isEditable ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
                    onClick={() => setEditingField(field)}
                    aria-label={`Edit ${field.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-danger-primary"
                    onClick={() => handleDeleteField(field)}
                    aria-label={`Delete ${field.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ) : undefined
            }
          >
            <CustomValueEditor
              customField={field}
              value={currentValues[field.id]}
              disabled={!isEditable}
              onChange={(val) => updateCustomFieldValue(field.id, val)}
            />
          </SidebarPropertyListItem>
        ))}
      </div>

      {isEditable && (
        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="mt-2 flex w-full items-center gap-2 rounded border border-dashed border-subtle px-2 py-1.5 text-12 text-tertiary transition-colors hover:text-secondary"
        >
          <Plus className="size-3.5" />
          Add custom field
        </button>
      )}

      <CreateUpdateCustomFieldModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSaved={() => refetchCustomFields()}
      />
      <CreateUpdateCustomFieldModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={!!editingField}
        initialField={editingField}
        onClose={() => setEditingField(null)}
        onSaved={() => {
          setEditingField(null);
          refetchCustomFields();
        }}
      />
    </>
  );
});
