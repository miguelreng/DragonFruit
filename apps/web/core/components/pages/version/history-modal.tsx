/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import useSWR from "swr";
import { XIcon } from "@/components/icons/lucide-shim";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Avatar, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// services
import { ProjectPageVersionService } from "@/services/page";
// store
import type { EPageStoreType } from "@/plane-web/hooks/store";
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PagesVersionEditor } from "./editor";
import { PageVersionsMainContent } from "./main-content";

const projectPageVersionService = new ProjectPageVersionService();

type Props = {
  handleClose: () => void;
  isOpen: boolean;
  page: TPageInstance;
  storeType: EPageStoreType;
};

type VersionHistoryItemProps = {
  active: boolean;
  createdBy: string | undefined;
  lastSavedAt: string;
  onClick: () => void;
  versionId: string;
};

const VersionHistoryItem = observer(function VersionHistoryItem(props: VersionHistoryItemProps) {
  const { active, createdBy, lastSavedAt, onClick, versionId } = props;
  const { getUserDetails } = useMember();
  const creator = createdBy ? getUserDetails(createdBy) : null;
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-layer-1",
        active && "border-subtle bg-layer-1"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-6 flex-none place-items-center">
          <div className={cn("size-2 rounded-full", active ? "bg-accent-primary" : "bg-layer-3")} />
        </div>
        <div className="min-w-0">
          <p className="text-12 font-medium text-primary">{renderFormattedDate(lastSavedAt)}</p>
          <p className="mt-0.5 text-11 text-tertiary">{renderFormattedTime(lastSavedAt)}</p>
          <div className="mt-2 flex items-center gap-1.5 text-11 text-secondary">
            <Avatar size="sm" src={getFileURL(creator?.avatar_url ?? "")} name={creator?.display_name} />
            <span className="truncate">{creator?.display_name ?? t("common.deactivated_user")}</span>
          </div>
        </div>
      </div>
      <span className="sr-only">{versionId}</span>
    </button>
  );
});

export const PageVersionHistoryModal = observer(function PageVersionHistoryModal(props: Props) {
  const { handleClose, isOpen, page, storeType } = props;
  const { workspaceSlug, projectId, pageId } = useParams<{
    workspaceSlug: string;
    projectId: string;
    pageId: string;
  }>();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const { t } = useTranslation();

  const pageKey = page.id ?? pageId ?? "";
  const projectKey = projectId ?? page.project_ids?.[0] ?? "";
  const workspaceKey = workspaceSlug ?? "";

  const { data: versionsList, error: versionsError } = useSWR(
    isOpen && pageKey ? `PAGE_VERSION_HISTORY_${pageKey}` : null,
    isOpen && pageKey ? () => projectPageVersionService.fetchAllVersions(workspaceKey, projectKey, pageKey) : null
  );

  useEffect(() => {
    if (!isOpen) {
      setSelectedVersionId(null);
      return;
    }

    if (!versionsList?.length) return;

    setSelectedVersionId((current) => {
      if (current && versionsList.some((version) => version.id === current)) return current;
      return versionsList[0]?.id ?? null;
    });
  }, [isOpen, versionsList]);

  const selectedVersion = useMemo(
    () => versionsList?.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versionsList]
  );

  const handleRestore = async (descriptionHTML: string) => {
    page.editor.editorRef?.clearEditor();
    page.editor.editorRef?.setEditorValue(descriptionHTML);
  };

  if (!isOpen) return null;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.VXL}>
      <div className="flex max-h-[85vh] min-h-[68vh] flex-col overflow-hidden" data-prevent-outside-click>
        <div className="flex items-center justify-between gap-3 border-b border-subtle px-5 py-4">
          <div>
            <h3 className="text-14 font-medium text-primary">
              {t("page_navigation_pane.tabs.info.version_history.label")}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid size-7 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
            aria-label={t("common.close")}
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="min-h-0 border-b border-subtle bg-layer-1/30 p-3 lg:border-r lg:border-b-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-11 font-medium tracking-wide text-tertiary uppercase">History</p>
              {versionsList?.length ? (
                <span className="text-11 text-tertiary">{versionsList.length} versions</span>
              ) : null}
            </div>

            {versionsError ? (
              <div className="rounded-lg border border-dashed border-subtle px-3 py-4 text-12 text-tertiary">
                Could not load the version list.
              </div>
            ) : !versionsList ? (
              <div className="space-y-2">
                <Loader.Item width="100%" height="44px" />
                <Loader.Item width="100%" height="44px" />
                <Loader.Item width="100%" height="44px" />
              </div>
            ) : versionsList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-subtle px-3 py-4 text-12 text-tertiary">
                No saved versions yet.
              </div>
            ) : (
              <div className="vertical-scrollbar flex scrollbar-sm max-h-[calc(85vh-8rem)] flex-col gap-1 overflow-y-auto pr-1">
                {versionsList.map((version) => (
                  <VersionHistoryItem
                    key={version.id}
                    active={selectedVersionId === version.id}
                    createdBy={version.owned_by}
                    lastSavedAt={version.last_saved_at}
                    onClick={() => setSelectedVersionId(version.id)}
                    versionId={version.id}
                  />
                ))}
              </div>
            )}
          </aside>

          <div className="h-full min-h-0 bg-surface-1">
            {selectedVersion?.id ? (
              <PageVersionsMainContent
                activeVersion={selectedVersion.id}
                editorComponent={PagesVersionEditor}
                fetchVersionDetails={(pageIdArg, versionId) =>
                  projectPageVersionService.fetchVersionById(workspaceKey, projectKey, pageIdArg, versionId)
                }
                handleClose={handleClose}
                handleRestore={handleRestore}
                pageId={pageKey}
                restoreEnabled={page.isContentEditable}
                storeType={storeType}
              />
            ) : (
              <div className="grid h-full place-items-center px-6 py-10 text-center">
                <div className="max-w-sm">
                  <h4 className="text-14 font-medium text-primary">Select a version</h4>
                  <p className="mt-2 text-12 text-tertiary">
                    Pick any saved version on the left to preview it in the editor.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalCore>
  );
});
