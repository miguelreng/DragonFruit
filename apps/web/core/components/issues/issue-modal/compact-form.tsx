/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { DEFAULT_WORK_ITEM_FORM_VALUES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import type { TIssue } from "@plane/types";
import { TextArea } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { IssueLabelSelect } from "@/components/issues/select";
import { useIssueModal } from "@/hooks/context/use-issue-modal";

export type CompactIssueFormProps = {
  data?: Partial<TIssue>;
  projectId: string;
  isDraft: boolean;
  onClose: () => void;
  onSubmit: (values: Partial<TIssue>) => Promise<void>;
};

export const CompactIssueForm = observer(function CompactIssueForm(props: CompactIssueFormProps) {
  const { data, projectId: defaultProjectId, onClose, onSubmit } = props;
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const { allowedProjectIds } = useIssueModal();

  const titleRef = useRef<HTMLInputElement | null>(null);
  const [showDescription, setShowDescription] = useState(false);

  const methods = useForm<TIssue>({
    defaultValues: { ...DEFAULT_WORK_ITEM_FORM_VALUES, project_id: defaultProjectId, ...data },
    reValidateMode: "onChange",
  });
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = methods;

  const projectId = watch("project_id");

  const onValid = async (formData: TIssue) => {
    const descriptionText = formData.description_html ?? "";
    const payload: Partial<TIssue> = {
      ...formData,
      description_html: descriptionText.trim() ? `<p>${descriptionText.replace(/\n/g, "<br/>")}</p>` : "<p></p>",
    };
    await onSubmit(payload);
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onValid)} className="flex w-full flex-col rounded-lg bg-surface-1">
        <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <h3 className="text-h6-medium text-primary">{t("create_new_issue")}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-layer-2">
            <CloseIcon className="h-4 w-4 text-secondary" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <Controller
            control={control}
            name="project_id"
            rules={{ required: true }}
            render={({ field: { value, onChange } }) => (
              <div className="h-7 w-fit">
                <ProjectDropdown
                  value={value}
                  onChange={onChange}
                  multiple={false}
                  buttonVariant="border-with-text"
                  renderCondition={(id) => allowedProjectIds.includes(id)}
                  disabled={!!data?.id || !!data?.sourceIssueId}
                />
              </div>
            )}
          />

          <Controller
            control={control}
            name="name"
            rules={{
              required: t("title_is_required"),
              validate: (value) => (value?.trim() === "" ? t("title_is_required") : undefined),
              maxLength: { value: 255, message: t("title_should_be_less_than_255_characters") },
            }}
            render={({ field: { value, onChange, ref } }) => (
              <input
                ref={(node) => {
                  ref(node);
                  if (node) titleRef.current = node;
                }}
                type="text"
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t("task_name")}
                autoFocus
                className="text-base w-full border-0 bg-transparent px-0 font-medium text-primary placeholder:text-placeholder focus:outline-none"
                style={{ fontFamily: "Newsreader, serif" }}
              />
            )}
          />
          {errors?.name?.message && (
            <span className="block text-caption-sm-medium text-danger-primary">{errors.name.message}</span>
          )}

          {showDescription ? (
            <Controller
              control={control}
              name="description_html"
              render={({ field: { value, onChange } }) => (
                <TextArea
                  value={value ?? ""}
                  onChange={onChange}
                  placeholder={t("add_description")}
                  className="!h-20 w-full text-13"
                  autoFocus
                />
              )}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="flex items-center gap-1.5 text-caption-sm-regular text-secondary hover:text-primary"
            >
              <span className="text-base leading-none">＋</span>
              {t("add_description")}
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Controller
              control={control}
              name="state_id"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <StateDropdown
                    value={value}
                    onChange={onChange}
                    projectId={projectId ?? undefined}
                    buttonVariant="border-with-text"
                    isForWorkItemCreation
                  />
                </div>
              )}
            />
            <Controller
              control={control}
              name="assignee_ids"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <MemberDropdown
                    projectId={projectId ?? undefined}
                    value={value}
                    onChange={onChange}
                    buttonVariant={value?.length > 0 ? "transparent-without-text" : "border-with-text"}
                    placeholder={t("assignees")}
                    multiple
                    includeAgents
                  />
                </div>
              )}
            />
            <Controller
              control={control}
              name="target_date"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <DateDropdown
                    value={value}
                    onChange={(date) => onChange(date ? renderFormattedPayloadDate(date) : null)}
                    buttonVariant="border-with-text"
                    placeholder={t("due_date")}
                  />
                </div>
              )}
            />
            <Controller
              control={control}
              name="priority"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <PriorityDropdown value={value} onChange={onChange} buttonVariant="border-with-text" />
                </div>
              )}
            />
            <Controller
              control={control}
              name="label_ids"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <IssueLabelSelect value={value} onChange={onChange} projectId={projectId ?? undefined} />
                </div>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting || !workspaceSlug}
          >
            {isSubmitting ? t("creating") : t("create_task")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
});
