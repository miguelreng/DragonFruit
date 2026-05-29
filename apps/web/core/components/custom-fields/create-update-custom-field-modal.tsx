/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import type { IProjectCustomField, TCustomFieldType } from "@plane/types";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { ProjectCustomFieldService } from "@/services/project";

const customFieldService = new ProjectCustomFieldService();

const FIELD_TYPE_OPTIONS: Array<{ value: TCustomFieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Boolean" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi select" },
];

type Props = {
  workspaceSlug: string;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (field: IProjectCustomField) => void;
  initialField?: IProjectCustomField | null;
  defaultName?: string;
};

const parseOptions = (raw: string) =>
  raw
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);

export const CreateUpdateCustomFieldModal = (props: Props) => {
  const { workspaceSlug, projectId, isOpen, onClose, onSaved, initialField = null, defaultName } = props;
  const { t } = useTranslation();

  const isEdit = !!initialField;
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<TCustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (initialField) {
      setName(initialField.name);
      setFieldType(initialField.field_type);
      setOptionsText((initialField.config?.options ?? []).join(", "));
      return;
    }
    setName(defaultName ?? "");
    setFieldType("text");
    setOptionsText("");
  }, [isOpen, initialField, defaultName]);

  const requiresOptions = useMemo(() => fieldType === "select" || fieldType === "multi_select", [fieldType]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("workspace_settings.settings.imports.csv_modal.custom_field_name_required"),
      });
      return;
    }

    const options = parseOptions(optionsText);
    if (requiresOptions && options.length === 0) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("workspace_settings.settings.imports.csv_modal.custom_field_options_required"),
      });
      return;
    }

    const payload = {
      name: trimmedName,
      field_type: fieldType,
      config: requiresOptions ? { options } : {},
    };

    setSubmitting(true);
    try {
      const field = initialField
        ? await customFieldService.update(workspaceSlug, projectId, initialField.id, payload)
        : await customFieldService.create(workspaceSlug, projectId, payload);

      onSaved(field);
      onClose();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: initialField
          ? t("workspace_settings.settings.imports.csv_modal.custom_field_updated")
          : t("workspace_settings.settings.imports.csv_modal.custom_field_created"),
      });
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: error?.error || t("workspace_settings.settings.imports.csv_modal.custom_field_save_failed"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={submitting ? () => {} : onClose}
      position={EModalPosition.TOP}
      width={EModalWidth.LG}
    >
      <div className="flex flex-col">
        <div className="border-b-[0.5px] border-subtle px-5 py-4">
          <h3 className="text-18 font-medium text-secondary">
            {isEdit
              ? t("workspace_settings.settings.imports.csv_modal.edit_custom_field")
              : t("workspace_settings.settings.imports.csv_modal.create_custom_field")}
          </h3>
          <p className="mt-1 text-13 text-tertiary">
            {t("workspace_settings.settings.imports.csv_modal.custom_field_project_scoped")}
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1">
            <label className="text-13 font-medium text-secondary">
              {t("workspace_settings.settings.imports.csv_modal.custom_field_name_label")}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("workspace_settings.settings.imports.csv_modal.custom_field_name_placeholder")}
              className="ring-primary w-full rounded-lg border border-subtle bg-layer-2 px-3 py-2 text-13 text-secondary outline-none focus:ring-1"
            />
          </div>

          <div className="space-y-1">
            <label className="text-13 font-medium text-secondary">
              {t("workspace_settings.settings.imports.csv_modal.custom_field_type_label")}
            </label>
            <CustomSelect
              value={fieldType}
              onChange={(val: string) => setFieldType(val as TCustomFieldType)}
              input
              label={FIELD_TYPE_OPTIONS.find((opt) => opt.value === fieldType)?.label ?? "Text"}
              buttonClassName="w-full"
              optionsClassName="w-[var(--reference-width)] min-w-0"
            >
              {FIELD_TYPE_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>

          {requiresOptions && (
            <div className="space-y-1">
              <label className="text-13 font-medium text-secondary">
                {t("workspace_settings.settings.imports.csv_modal.custom_field_options_label")}
              </label>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={t("workspace_settings.settings.imports.csv_modal.custom_field_options_placeholder")}
                rows={4}
                className="ring-primary w-full rounded-lg border border-subtle bg-layer-2 px-3 py-2 text-13 text-secondary outline-none focus:ring-1"
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={submitting}>
            {t("workspace_settings.settings.imports.csv_modal.cancel")}
          </Button>
          <Button variant="primary" size="lg" type="button" onClick={handleSubmit} loading={submitting}>
            {isEdit
              ? t("workspace_settings.settings.imports.csv_modal.custom_field_save_changes")
              : t("workspace_settings.settings.imports.csv_modal.custom_field_create_cta")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
