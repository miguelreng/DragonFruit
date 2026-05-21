/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import ProjectCommonAttributes from "@/components/project/create/common-attributes";
import ProjectCreateHeader from "@/components/project/create/header";
import ProjectCreateButtons from "@/components/project/create/project-create-buttons";
import { useProject } from "@/hooks/store/use-project";
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { TProject } from "@/plane-web/types/projects";
import { ProjectTemplateService } from "@/services/project/project-template.service";
import type { TProjectTemplate } from "@/services/project/project-template.service";
// local
import { ProjectTemplateSelect } from "./template-select";
import { getProjectFormValues } from "./utils";

const projectTemplateService = new ProjectTemplateService();

export type TCreateProjectFormProps = {
  setToFavorite?: boolean;
  workspaceSlug: string;
  onClose: () => void;
  handleNextStep: (projectId: string) => void;
  data?: Partial<TProject>;
  templateId?: string;
};

export const CreateProjectForm = observer(function CreateProjectForm(props: TCreateProjectFormProps) {
  const { setToFavorite, workspaceSlug, data, onClose, handleNextStep, templateId: initialTemplateId } = props;
  const { t } = useTranslation();
  const { addProjectToFavorites, createProject } = useProject();
  const [shouldAutoSyncIdentifier, setShouldAutoSyncIdentifier] = useState(true);
  const [templates, setTemplates] = useState<TProjectTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplateId ?? "");
  const methods = useForm<TProject>({
    defaultValues: { ...getProjectFormValues(), ...data },
    reValidateMode: "onChange",
  });
  const { handleSubmit, reset, setValue } = methods;
  const { isMobile } = usePlatformOS();

  // Load templates so the picker is populated. Errors are silent —
  // a missing template list shouldn't block project creation.
  useEffect(() => {
    if (!workspaceSlug) return;
    let cancelled = false;
    projectTemplateService
      .list(workspaceSlug)
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
        return rows;
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  // Apply template defaults to the form whenever the picker changes.
  // Switching back to "blank" resets to the bare defaults — preserves
  // the auto-identifier syncing UX (user can still tweak everything).
  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((entry) => entry.id === selectedTemplateId);
    if (!tpl) return;
    // Don't overwrite the project name if the user already typed
    // something — the template's name is just a fallback.
    setValue("description", tpl.project_description || "");
    setValue("network", tpl.network as 0 | 2);
    if (tpl.logo_props && Object.keys(tpl.logo_props).length > 0) {
      setValue("logo_props", tpl.logo_props as TProject["logo_props"]);
    }
  }, [selectedTemplateId, templates, setValue]);

  const handleAddToFavorites = (projectId: string) => {
    if (!workspaceSlug) return;
    addProjectToFavorites(workspaceSlug.toString(), projectId).catch(() => {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("failed_to_remove_project_from_favorites"),
      });
    });
  };

  const onSubmit = async (formData: Partial<TProject>) => {
    formData.identifier = formData.identifier?.toUpperCase();

    // Template path: the server merges in defaults + materialises
    // any `initial_tasks`. Returns a ProjectListSerializer payload
    // shaped just like createProject, so the rest of the flow is
    // identical.
    const promise = selectedTemplateId
      ? projectTemplateService.instantiate(workspaceSlug.toString(), selectedTemplateId, formData)
      : createProject(workspaceSlug.toString(), formData);

    return promise
      .then((res: { id: string }) => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t("project_created_successfully"),
        });
        if (setToFavorite) handleAddToFavorites(res.id);
        handleNextStep(res.id);
        return res;
      })
      .catch((err) => {
        const errorData = err?.data ?? {};
        const nameError = errorData.name?.includes("PROJECT_NAME_ALREADY_EXIST");
        const identifierError = errorData?.identifier?.includes("PROJECT_IDENTIFIER_ALREADY_EXIST");

        if (nameError) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message: t("project_name_already_taken"),
          });
        } else if (identifierError) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message: t("project_identifier_already_taken"),
          });
        } else {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message: t("something_went_wrong"),
          });
        }
      });
  };

  const handleClose = () => {
    onClose();
    setShouldAutoSyncIdentifier(true);
    setTimeout(() => {
      reset();
    }, 300);
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col rounded-lg bg-surface-1">
        <ProjectCreateHeader handleClose={handleClose} />
        <div className="space-y-4 px-5 py-4">
          {/* Template picker. Hides entirely if no templates exist
              so blank projects feel as zero-friction as before. */}
          {templates.length > 0 && (
            <ProjectTemplateSelect
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              onTemplateChange={setSelectedTemplateId}
            />
          )}
          <ProjectCommonAttributes
            setValue={setValue}
            isMobile={isMobile}
            shouldAutoSyncIdentifier={shouldAutoSyncIdentifier}
            setShouldAutoSyncIdentifier={setShouldAutoSyncIdentifier}
          />
        </div>
        <ProjectCreateButtons handleClose={handleClose} />
      </form>
    </FormProvider>
  );
});
