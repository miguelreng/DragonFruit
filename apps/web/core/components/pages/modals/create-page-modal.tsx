/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
// constants
import type { EPageAccess } from "@plane/constants";
import type { TPage, TPageTemplate } from "@plane/types";
// ui
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { usePageStore } from "@/plane-web/hooks/store";
// services
import { PageTemplateService } from "@/services/page/page-template.service";
// local imports
import { PageForm } from "./page-form";

const templateService = new PageTemplateService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  isModalOpen: boolean;
  pageAccess?: EPageAccess;
  handleModalClose: () => void;
  redirectionEnabled?: boolean;
  storeType: EPageStoreType;
};

export function CreatePageModal(props: Props) {
  const {
    workspaceSlug,
    projectId,
    isModalOpen,
    pageAccess,
    handleModalClose,
    redirectionEnabled = false,
    storeType,
  } = props;
  // states
  const [pageFormData, setPageFormData] = useState<Partial<TPage>>({
    id: undefined,
    name: "",
    logo_props: undefined,
  });
  const [templates, setTemplates] = useState<TPageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  // router
  const router = useAppRouter();
  // store hooks
  const { createPage } = usePageStore(storeType);
  const handlePageFormData = <T extends keyof TPage>(key: T, value: TPage[T]) =>
    setPageFormData((prev) => ({ ...prev, [key]: value }));

  // update page access in form data when page access from the store changes
  useEffect(() => {
    setPageFormData((prev) => ({ ...prev, access: pageAccess }));
  }, [pageAccess]);

  // Load templates when the modal opens so the picker is populated. Errors are
  // intentionally silent — a missing template list shouldn't block page creation.
  useEffect(() => {
    if (!isModalOpen || !workspaceSlug) return;
    let cancelled = false;
    const loadTemplates = async () => {
      try {
        const rows = await templateService.list(workspaceSlug);
        if (!cancelled) setTemplates(rows);
      } catch {
        if (!cancelled) setTemplates([]);
      }
    };
    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, workspaceSlug]);

  const handleStateClear = useCallback(() => {
    setPageFormData({ id: undefined, name: "", access: pageAccess });
    setSelectedTemplateId("");
    handleModalClose();
  }, [pageAccess, handleModalClose]);

  const handleFormSubmit = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;

    try {
      // Template path — backend clones the template into a new page in this
      // project, then we route to it. Skips the regular createPage store call
      // because instantiation produces a fully-formed page with body content.
      if (selectedTemplateId) {
        const created = await templateService.instantiate(workspaceSlug, projectId, selectedTemplateId, {
          name: pageFormData.name || undefined,
          logo_props: pageFormData.logo_props,
          access: pageFormData.access,
        });
        if (created) {
          handleStateClear();
          if (redirectionEnabled) router.push(`/${workspaceSlug}/projects/${projectId}/pages/${created.id}`);
        }
        return;
      }

      const pageData = await createPage(pageFormData);
      if (pageData?.id) {
        handleStateClear();
        if (redirectionEnabled) router.push(`/${workspaceSlug}/projects/${projectId}/pages/${pageData.id}`);
      } else {
        console.error("Page create returned empty payload");
      }
    } catch (error) {
      console.error(error);
    }
  }, [
    workspaceSlug,
    projectId,
    selectedTemplateId,
    pageFormData,
    createPage,
    handleStateClear,
    redirectionEnabled,
    router,
  ]);

  return (
    <ModalCore
      isOpen={isModalOpen}
      handleClose={handleModalClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XXL}
    >
      <PageForm
        formData={pageFormData}
        handleFormData={handlePageFormData}
        handleModalClose={handleStateClear}
        handleFormSubmit={handleFormSubmit}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onTemplateChange={setSelectedTemplateId}
      />
    </ModalCore>
  );
}
