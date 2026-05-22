/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSearchSelect, CustomSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { FileText, UploadCloud, X } from "@/components/icons/lucide-shim";
import { useProject } from "@/hooks/store/use-project";
import { IssueService } from "@/services/issue/issue.service";
import {
  type CsvFieldKey,
  type CsvMapping,
  type ParsedCsv,
  detectMapping,
  normalizePriority,
  parseCsv,
} from "./csv-parser";

const issueService = new IssueService();
const FIELD_KEYS: CsvFieldKey[] = ["name", "description", "priority"];
const LABEL_CLASS = "block text-13 font-medium text-secondary mb-1";

type Props = {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
};

export const CsvImportModal = observer(function CsvImportModal({ workspaceSlug, isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const { workspaceProjectIds, getProjectById } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [projectId, setProjectId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({ name: null, description: null, priority: null });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setProjectId("");
      setFile(null);
      setParsed(null);
      setMapping({ name: null, description: null, priority: null });
      setSubmitting(false);
    }
  }, [isOpen]);

  const handleFile = async (f: File | null) => {
    setFile(f);
    setParsed(null);
    if (!f) return;
    try {
      const text = await f.text();
      const result = parseCsv(text);
      if (result.headers.length === 0 || result.rows.length === 0) {
        setToast({ type: TOAST_TYPE.ERROR, title: t("workspace_settings.settings.imports.csv_modal.error_empty") });
        return;
      }
      setParsed(result);
      setMapping(detectMapping(result.headers));
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("workspace_settings.settings.imports.csv_modal.error_parse") });
    }
  };

  const handleClearFile = () => {
    setFile(null);
    setParsed(null);
    setMapping({ name: null, description: null, priority: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!projectId) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("workspace_settings.settings.imports.csv_modal.error_no_project") });
      return;
    }
    if (!parsed) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("workspace_settings.settings.imports.csv_modal.error_no_file") });
      return;
    }
    if (mapping.name === null) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("workspace_settings.settings.imports.csv_modal.error_no_name") });
      return;
    }

    setSubmitting(true);
    const total = parsed.rows.length;
    let ok = 0;
    let failed = 0;

    // Sequential creation keeps load gentle on the API and gives us a clean
    // progress count. For very large CSVs we'd want chunked parallel writes
    // or a dedicated backend endpoint, but that's not v1.
    for (const row of parsed.rows) {
      const name = (row[mapping.name] ?? "").trim();
      if (!name) {
        failed++;
        continue;
      }
      const description =
        mapping.description !== null ? (row[mapping.description] ?? "").trim() || undefined : undefined;
      const priority = mapping.priority !== null ? normalizePriority(row[mapping.priority]) : "none";
      try {
        await issueService.createIssue(workspaceSlug, projectId, {
          name,
          description_html: description ? `<p>${escapeHtml(description)}</p>` : undefined,
          priority,
        });
        ok++;
      } catch {
        failed++;
      }
    }

    setSubmitting(false);
    const project = getProjectById(projectId);
    if (failed === 0) {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("workspace_settings.settings.imports.csv_modal.success", {
          count: ok,
          project: project?.name ?? "",
        }),
      });
    } else {
      setToast({
        type: TOAST_TYPE.INFO,
        title: t("workspace_settings.settings.imports.csv_modal.partial", { ok, total, failed }),
      });
    }
    onClose();
  };

  const projectOptions = useMemo(
    () =>
      (workspaceProjectIds ?? [])
        .map((id) => {
          const p = getProjectById(id);
          if (!p) return null;
          return {
            value: id,
            query: `${p.name} ${p.identifier ?? ""}`,
            content: (
              <div className="flex min-w-0 items-center gap-2">
                {p.identifier && <span className="shrink-0 text-10 text-tertiary">{p.identifier}</span>}
                <span className="truncate">{p.name}</span>
              </div>
            ),
          };
        })
        .filter((o): o is NonNullable<typeof o> => o !== null),
    [workspaceProjectIds, getProjectById]
  );

  const selectedProject = projectId ? getProjectById(projectId) : null;
  const previewRows = parsed?.rows.slice(0, 5) ?? [];

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={submitting ? () => {} : onClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXL}
    >
      <div className="flex flex-col">
        <div className="border-b-[0.5px] border-subtle px-5 py-4">
          <h3 className="text-18 font-medium text-secondary">
            {t("workspace_settings.settings.imports.csv_modal.title")}
          </h3>
          <p className="mt-1 text-13 text-tertiary">{t("workspace_settings.settings.imports.csv_modal.file_hint")}</p>
        </div>

        <div className="flex flex-col gap-5 px-5 py-4">
          <div>
            <label className={LABEL_CLASS}>
              {t("workspace_settings.settings.imports.csv_modal.step_project")}{" "}
              <span className="text-danger-strong">*</span>
            </label>
            <CustomSearchSelect
              value={projectId}
              onChange={(val: string) => setProjectId(val)}
              options={projectOptions}
              input
              label={
                selectedProject ? (
                  <div className="flex min-w-0 items-center gap-2">
                    {selectedProject.identifier && (
                      <span className="shrink-0 text-10 text-tertiary">{selectedProject.identifier}</span>
                    )}
                    <span className="truncate">{selectedProject.name}</span>
                  </div>
                ) : (
                  <span className="text-tertiary">
                    {t("workspace_settings.settings.imports.csv_modal.project_placeholder")}
                  </span>
                )
              }
              buttonClassName="w-full"
              optionsClassName="w-[var(--reference-width)] min-w-0"
              noResultsMessage="No projects"
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>
              {t("workspace_settings.settings.imports.csv_modal.step_file")}{" "}
              <span className="text-danger-strong">*</span>
            </label>
            {file ? (
              <div className="flex items-center gap-3 rounded-md border border-subtle bg-layer-2 px-3 py-2.5">
                <FileText className="size-4 shrink-0 text-tertiary" />
                <span className="flex-1 truncate text-13 text-secondary">{file.name}</span>
                {parsed && (
                  <Pill variant={EPillVariant.DEFAULT} size={EPillSize.XS}>
                    {parsed.rows.length} rows
                  </Pill>
                )}
                <button
                  type="button"
                  onClick={handleClearFile}
                  className="grid size-6 place-items-center rounded text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                  aria-label="Remove file"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-subtle bg-layer-2 px-4 py-6 text-13 text-tertiary transition-colors hover:border-strong hover:text-secondary"
              >
                <UploadCloud className="size-4" />
                {t("workspace_settings.settings.imports.csv_modal.drop_or_click")}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {parsed && (
            <div>
              <label className={LABEL_CLASS}>{t("workspace_settings.settings.imports.csv_modal.step_mapping")}</label>
              <p className="-mt-0.5 mb-3 text-11 text-tertiary">
                {t("workspace_settings.settings.imports.csv_modal.mapping_hint")}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {FIELD_KEYS.map((key) => {
                  const required = key === "name";
                  const idx = mapping[key];
                  const headerLabel =
                    idx !== null
                      ? parsed.headers[idx] || `Column ${idx + 1}`
                      : t("workspace_settings.settings.imports.csv_modal.field_unmapped");
                  return (
                    <div key={key} className="flex flex-col">
                      <span className="mb-1 text-11 font-medium text-secondary">
                        {t(`workspace_settings.settings.imports.csv_modal.field_${key}`)}
                        {required && <span className="text-danger-strong ml-0.5">*</span>}
                      </span>
                      <CustomSelect
                        value={idx === null ? "" : String(idx)}
                        onChange={(val: string) =>
                          setMapping((m) => ({ ...m, [key]: val === "" ? null : Number(val) }))
                        }
                        input
                        label={<span className={idx === null ? "text-tertiary" : ""}>{headerLabel}</span>}
                        buttonClassName="w-full"
                        optionsClassName="w-[var(--reference-width)] min-w-0"
                      >
                        {!required && (
                          <CustomSelect.Option value="">
                            <span className="text-tertiary">
                              {t("workspace_settings.settings.imports.csv_modal.field_unmapped")}
                            </span>
                          </CustomSelect.Option>
                        )}
                        {parsed.headers.map((h, i) => (
                          <CustomSelect.Option key={i} value={String(i)}>
                            {h || `Column ${i + 1}`}
                          </CustomSelect.Option>
                        ))}
                      </CustomSelect>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <p className="mb-2 text-11 text-tertiary">
                  {t("workspace_settings.settings.imports.csv_modal.preview_label", {
                    rows: previewRows.length,
                    total: parsed.rows.length,
                  })}
                </p>
                <div className="overflow-x-auto rounded-md border-[0.5px] border-subtle">
                  <table className="min-w-full text-11">
                    <thead className="bg-layer-2 text-tertiary">
                      <tr>
                        {parsed.headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium">
                            {h || `Column ${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri} className="border-t-[0.5px] border-subtle text-secondary">
                          {parsed.headers.map((_, ci) => (
                            <td key={ci} className="max-w-xs truncate px-3 py-2">
                              {row[ci] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="button"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!parsed || submitting}
          >
            {submitting
              ? t("workspace_settings.settings.imports.csv_modal.submitting")
              : t("workspace_settings.settings.imports.csv_modal.submit", { count: parsed?.rows.length ?? 0 })}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
