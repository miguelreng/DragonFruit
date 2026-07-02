/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { CustomMenu } from "@plane/ui";
import type { TSearchEntityRequestPayload, TWebhookConnectionQueryParams } from "@plane/types";
import { EFileAssetType } from "@plane/types";
// components
import { setActiveDocPageId } from "@/components/agent-chat/active-doc-page";
import { LogoSpinner } from "@/components/common/logo-spinner";
import { EditorCapabilitiesGuide } from "@/components/editor/editor-capabilities-guide";
import type { TPageRootConfig, TPageRootHandlers } from "@/components/pages/editor/page-root";
import { PageRoot } from "@/components/pages/editor/page-root";
// plane web components
import { PageShareControl } from "@/plane-web/components/pages/header/share-control";
// hooks
import { useEditorConfig } from "@/hooks/editor";
import { usePageOperations } from "@/hooks/use-page-operations";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
// helpers
import { getPublicPageSlug, normalizePublicPageSlug, validatePublicPageSlug } from "@/helpers/page-public";
// plane web hooks
import { EPageStoreType, usePage, usePageStore } from "@/plane-web/hooks/store";
// services
import { ProjectPageService, ProjectPageVersionService } from "@/services/page";
import { WorkspaceService } from "@/services/workspace.service";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { BRIEF_PAGE_NAME, briefCacheKey, getBriefPageDisplayName, isBriefPage } from "./constants";
import { EllipsisHorizontalIcon, LockClosedIcon, LockOpenIcon } from "./icons";

const workspaceService = new WorkspaceService();
const projectPageService = new ProjectPageService();
const projectPageVersionService = new ProjectPageVersionService();

const storeType = EPageStoreType.PROJECT;

type TBriefRootProps = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * Resolves (or lazily creates) the hidden brief page for the project, then
 * renders the same collaborative editor experience the Docs pages use.
 */
export const ProjectBriefRoot = observer(function ProjectBriefRoot(props: TBriefRootProps) {
  const { workspaceSlug, projectId } = props;
  // store hooks
  const { fetchPagesList, createPage, getPageById, getCurrentProjectPageIds } = usePageStore(storeType);
  const { getProjectById } = useProject();
  // local state
  const [briefPageId, setBriefPageId] = useState<string | undefined>(undefined);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const resolveBriefPage = useCallback(async () => {
    // 1. fast path: per-browser cache
    const cachedId = typeof window !== "undefined" ? window.localStorage.getItem(briefCacheKey(projectId)) : null;
    // make sure the project's pages are loaded so we can discover/validate
    await fetchPagesList(workspaceSlug, projectId);
    if (cachedId && getPageById(cachedId)) {
      setBriefPageId(cachedId);
      return cachedId;
    }
    // 2. discover an existing brief page by its reserved name
    const existing = getCurrentProjectPageIds(projectId)
      .map((id) => getPageById(id))
      .find((page) => isBriefPage(page));
    if (existing?.id) {
      if (typeof window !== "undefined") window.localStorage.setItem(briefCacheKey(projectId), existing.id);
      setBriefPageId(existing.id);
      return existing.id;
    }
    // 3. lazily create one, seeding it with any legacy brief written into the
    // project description (best effort — the collaborative editor reads the
    // binary, so seeded HTML may not surface until first edit).
    const project = getProjectById(projectId);
    const created = await createPage({
      name: BRIEF_PAGE_NAME,
      page_type: "doc",
      is_brief: true,
      description_html: project?.description_html || "<p></p>",
    });
    if (created?.id) {
      if (typeof window !== "undefined") window.localStorage.setItem(briefCacheKey(projectId), created.id);
      setBriefPageId(created.id);
      return created.id;
    }
    throw new Error("Could not resolve the project brief page.");
  }, [createPage, fetchPagesList, getCurrentProjectPageIds, getPageById, getProjectById, projectId, workspaceSlug]);

  useSWR(
    workspaceSlug && projectId ? `PROJECT_BRIEF_PAGE_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId
      ? () => resolveBriefPage().catch((error) => setResolveError(error?.message ?? "Failed to open the brief."))
      : null,
    { revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false }
  );

  // Switching projects keeps this component mounted, so drop the previous
  // project's brief immediately — otherwise the editor keeps showing the old
  // brief until (and unless) the new one re-resolves. Pairs with the key below
  // so the editor fully remounts for the new project's brief.
  useEffect(() => {
    setBriefPageId(undefined);
  }, [projectId]);

  if (resolveError)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center">
        <h3 className="text-center text-16 font-semibold">Couldn{"'"}t open the brief</h3>
        <p className="mt-3 text-center text-13 text-secondary">{resolveError}</p>
      </div>
    );

  if (!briefPageId)
    return (
      <div className="grid size-full place-items-center">
        <LogoSpinner />
      </div>
    );

  return <BriefPageEditor key={briefPageId} workspaceSlug={workspaceSlug} projectId={projectId} pageId={briefPageId} />;
});

// Brief header actions: a Publish control (reusing the Docs PageShareControl —
// the popover with the public URL, copy, and an editable slug) plus a three-dots
// menu holding Lock. Icons are from the Heroicons set.
const BriefPageActions = observer(function BriefPageActions(props: { page: TPageInstance; title: string }) {
  const { page, title } = props;
  const { pageOperations } = usePageOperations({ page });
  const isLocked = page.is_locked;
  const itemClass = "flex w-full items-center gap-2 text-13";
  const canPublish = page.canCurrentUserChangeAccess && !page.archived_at;
  const canLock = page.canCurrentUserLockPage;

  return (
    <div className="z-20 flex flex-shrink-0 items-center justify-between gap-2 px-page-x pt-5 pb-5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-13 font-medium text-primary">{title}</span>
        <span className="hidden shrink-0 items-center gap-1 rounded-md border border-subtle bg-surface-1 px-2 py-0.5 text-11 font-medium text-secondary sm:inline-flex">
          Atlas reads this
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {/* The Brief renders PageRoot chromeless (no PageHeaderActions), so mount
            the editor guide here — styled like the other floating controls. */}
        <EditorCapabilitiesGuide buttonClassName="size-7 border border-subtle bg-surface-1" />
        {canPublish && <PageShareControl page={page} storeType={storeType} />}
        {canLock && (
          <CustomMenu
            placement="bottom-end"
            ariaLabel="Brief options"
            optionsClassName="min-w-44 p-1"
            customButtonClassName="grid size-7 place-items-center rounded-lg border border-subtle bg-surface-1 text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
            customButton={<EllipsisHorizontalIcon className="size-4" />}
          >
            <CustomMenu.MenuItem onClick={() => pageOperations.toggleLock()} className="rounded-md">
              <span className={itemClass}>
                {isLocked ? (
                  <LockOpenIcon className="size-4 flex-shrink-0" />
                ) : (
                  <LockClosedIcon className="size-4 flex-shrink-0" />
                )}
                {isLocked ? "Unlock" : "Lock"}
              </span>
            </CustomMenu.MenuItem>
          </CustomMenu>
        )}
      </div>
    </div>
  );
});

type TBriefPageEditorProps = TBriefRootProps & {
  pageId: string;
};

const BriefPageEditor = observer(function BriefPageEditor(props: TBriefPageEditorProps) {
  const { workspaceSlug, projectId, pageId } = props;
  // store hooks
  const { createPage, fetchPageDetails } = usePageStore(storeType);
  const page = usePage({ pageId, storeType });
  const { getWorkspaceBySlug } = useWorkspace();
  const { getProjectById } = useProject();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  // derived values
  const workspaceId = workspaceSlug ? (getWorkspaceBySlug(workspaceSlug)?.id ?? "") : "";
  const projectName = getProjectById(projectId)?.name ?? "Project";
  const briefDisplayName = getBriefPageDisplayName(projectName);
  const { id, updateDescription } = page ?? {};
  // editor config
  const { getEditorFileHandlers } = useEditorConfig();
  // entity search handler
  const fetchEntityCallback = useCallback(
    async (payload: TSearchEntityRequestPayload) =>
      await workspaceService.searchEntity(workspaceSlug, { ...payload, project_id: projectId }),
    [projectId, workspaceSlug]
  );
  // fetch page details (binary, meta)
  useSWR(
    pageId ? `BRIEF_PAGE_DETAILS_${pageId}` : null,
    pageId ? () => fetchPageDetails(workspaceSlug, projectId, pageId) : null,
    { revalidateIfStale: true, revalidateOnFocus: true, revalidateOnReconnect: true }
  );

  // Default the public URL slug to a readable, project-scoped value
  // (e.g. "baby-brazil-brief") so the published URL isn't the page UUID. Only
  // set it when there's no slug yet — never override a user's custom slug.
  // getPublicPageSlug falls back to page.id when no public_slug is set.
  useEffect(() => {
    if (!page?.id || getPublicPageSlug(page) !== page.id) return;
    const desired = normalizePublicPageSlug(`${projectName} brief`);
    if (!desired || validatePublicPageSlug(desired) !== null) return;
    void page.updateViewProps({ public_slug: desired });
  }, [page, projectName]);

  // Tell the docked Atlas sidebar which page backs the Brief so its in-editor
  // co-writing targets it — the /brief route carries no :pageId of its own.
  useEffect(() => {
    setActiveDocPageId(pageId);
    return () => setActiveDocPageId(null);
  }, [pageId]);

  const handlers: TPageRootHandlers = useMemo(
    () => ({
      create: createPage,
      fetchAllVersions: async (versionPageId) =>
        await projectPageVersionService.fetchAllVersions(workspaceSlug, projectId, versionPageId),
      fetchDescriptionBinary: async () => {
        if (!id) return;
        return await projectPageService.fetchDescriptionBinary(workspaceSlug, projectId, id);
      },
      fetchEntity: fetchEntityCallback,
      fetchVersionDetails: async (versionPageId, versionId) =>
        await projectPageVersionService.fetchVersionById(workspaceSlug, projectId, versionPageId, versionId),
      restoreVersion: async (versionPageId, versionId) =>
        await projectPageVersionService.restoreVersion(workspaceSlug, projectId, versionPageId, versionId),
      getRedirectionLink: () => `/${workspaceSlug}/projects/${projectId}/brief`,
      updateDescription: updateDescription ?? (async () => {}),
    }),
    [createPage, fetchEntityCallback, id, updateDescription, workspaceSlug, projectId]
  );

  const config: TPageRootConfig = useMemo(
    () => ({
      fileHandler: getEditorFileHandlers({
        projectId,
        uploadFile: async (blockId, file) => {
          const { asset_id } = await uploadEditorAsset({
            blockId,
            data: { entity_identifier: id ?? "", entity_type: EFileAssetType.PAGE_DESCRIPTION },
            file,
            projectId,
            workspaceSlug,
          });
          return asset_id;
        },
        duplicateFile: async (assetId: string) => {
          const { asset_id } = await duplicateEditorAsset({
            assetId,
            entityId: id,
            entityType: EFileAssetType.PAGE_DESCRIPTION,
            projectId,
            workspaceSlug,
          });
          return asset_id;
        },
        workspaceId,
        workspaceSlug,
      }),
    }),
    [getEditorFileHandlers, projectId, workspaceId, workspaceSlug, uploadEditorAsset, id, duplicateEditorAsset]
  );

  const webhookConnectionParams: TWebhookConnectionQueryParams = useMemo(
    () => ({ documentType: "project_page", projectId, workspaceSlug }),
    [projectId, workspaceSlug]
  );

  if (!page || !id)
    return (
      <div className="grid size-full place-items-center">
        <LogoSpinner />
      </div>
    );

  return (
    <div className="df-brief-chromeless relative flex h-full w-full flex-shrink-0 flex-col overflow-hidden">
      {/* The collaborative editor renders its own editable page title (the page
          name, "Project Brief"). In the Brief we show a fixed project-brief label
          instead, so hide the editor's built-in title block. */}
      <style>{`.df-brief-chromeless div:has(> .page-title-editor){display:none !important;}`}</style>
      <BriefPageActions page={page} title={briefDisplayName} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <PageRoot
          config={config}
          handlers={handlers}
          storeType={storeType}
          page={page}
          webhookConnectionParams={webhookConnectionParams}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          chromeless
          editorPlaceholder="Add project context here - Atlas uses it on every task."
        />
      </div>
    </div>
  );
});
