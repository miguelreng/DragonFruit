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
import { PAGE_COVER_OPTIONS } from "../editor/header/cover-options";

const templateService = new PageTemplateService();
const PAGE_READY_RETRY_DELAYS_MS = [150, 300, 500, 800, 1200];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_EMOJI_HEADERS = ["128221", "128214", "128173", "128196", "127807"];
const fetchPageWithRetry = async (
  fetchPageDetails: (workspaceSlug: string, projectId: string, pageId: string) => Promise<unknown>,
  workspaceSlug: string,
  projectId: string,
  pageId: string,
  delays: readonly number[],
  attempt = 0
): Promise<void> => {
  try {
    await fetchPageDetails(workspaceSlug, projectId, pageId);
  } catch {
    if (attempt >= delays.length) return;
    await sleep(delays[attempt]);
    await fetchPageWithRetry(fetchPageDetails, workspaceSlug, projectId, pageId, delays, attempt + 1);
  }
};

const getDefaultPageFormState = (pageAccess?: EPageAccess): Partial<TPage> => {
  const randomCover = PAGE_COVER_OPTIONS[Math.floor(Math.random() * PAGE_COVER_OPTIONS.length)]?.id;
  const randomEmoji = DEFAULT_EMOJI_HEADERS[Math.floor(Math.random() * DEFAULT_EMOJI_HEADERS.length)] ?? "128221";

  return {
    id: undefined,
    name: "",
    access: pageAccess,
    logo_props: {
      in_use: "emoji",
      emoji: {
        value: randomEmoji,
      },
    },
    view_props: randomCover
      ? {
          cover: randomCover,
        }
      : undefined,
  };
};

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
    ...getDefaultPageFormState(pageAccess),
  });
  const [templates, setTemplates] = useState<TPageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  // router
  const router = useAppRouter();
  // store hooks
  const { createPage, fetchPageDetails } = usePageStore(storeType);
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
    setPageFormData(getDefaultPageFormState(pageAccess));
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
        if (created?.id) {
          await fetchPageWithRetry(fetchPageDetails, workspaceSlug, projectId, created.id, PAGE_READY_RETRY_DELAYS_MS);
          handleStateClear();
          if (redirectionEnabled) router.push(`/${workspaceSlug}/projects/${projectId}/pages/${created.id}`);
        }
        return;
      }

      const pageData = await createPage(pageFormData);
      if (pageData?.id) {
        await fetchPageWithRetry(fetchPageDetails, workspaceSlug, projectId, pageData.id, PAGE_READY_RETRY_DELAYS_MS);
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
    fetchPageDetails,
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
