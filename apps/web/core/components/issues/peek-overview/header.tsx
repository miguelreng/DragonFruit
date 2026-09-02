/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { ChevronRight, MoveDiagonal, Pin } from "@/components/icons/lucide-shim";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CenterPanelIcon, CopyLinkIcon, FullScreenPanelIcon, SidePanelIcon } from "@/components/icons/propel-shim";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TNameDescriptionLoader } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { CustomSelect, FavoriteStar } from "@plane/ui";
import { copyUrlToClipboard, generateWorkItemLink } from "@plane/utils";
// hooks
import { useFavorite } from "@/hooks/store/use-favorite";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { WorkItemDetailQuickActions } from "../issue-layouts/quick-action-dropdowns";
import { NameDescriptionUpdateStatus } from "../issue-update-status";
import { IconButton, getIconButtonStyling } from "@plane/propel/icon-button";

export type TPeekModes = "side-peek" | "modal" | "full-screen";

const PEEK_OPTIONS: { key: TPeekModes; icon: any; i18n_title: string }[] = [
  {
    key: "side-peek",
    icon: SidePanelIcon,
    i18n_title: "common.side_peek",
  },
  {
    key: "modal",
    icon: CenterPanelIcon,
    i18n_title: "common.modal",
  },
  {
    key: "full-screen",
    icon: FullScreenPanelIcon,
    i18n_title: "common.full_screen",
  },
];

export type PeekOverviewHeaderProps = {
  peekMode: TPeekModes;
  setPeekMode: (value: TPeekModes) => void;
  removeRoutePeekId: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  isArchived: boolean;
  disabled: boolean;
  embedIssue: boolean;
  toggleDeleteIssueModal: (value: boolean) => void;
  toggleArchiveIssueModal: (value: boolean) => void;
  toggleDuplicateIssueModal: (value: boolean) => void;
  toggleEditIssueModal: (value: boolean) => void;
  handleRestoreIssue: () => Promise<void>;
  isSubmitting: TNameDescriptionLoader;
};

export const IssuePeekOverviewHeader = observer(function IssuePeekOverviewHeader(props: PeekOverviewHeaderProps) {
  const {
    peekMode,
    setPeekMode,
    workspaceSlug,
    projectId,
    issueId,
    isArchived,
    disabled,
    embedIssue = false,
    removeRoutePeekId,
    toggleDeleteIssueModal,
    toggleArchiveIssueModal,
    toggleDuplicateIssueModal,
    toggleEditIssueModal,
    handleRestoreIssue,
    isSubmitting,
  } = props;
  // ref
  const parentRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  // router
  const router = useAppRouter();
  // store hooks
  const {
    issue: { getIssueById },
    setPeekIssue,
    isPeekPinned,
    setPeekPinned,
    removeIssue,
    archiveIssue,
    getIsIssuePeeked,
  } = useIssueDetail();
  const { entityMap: favoriteEntityMap, addFavorite, removeFavoriteEntity } = useFavorite();
  const { isMobile } = usePlatformOS();
  const { getProjectIdentifierById } = useProject();
  // derived values
  const issueDetails = getIssueById(issueId);
  const currentMode = PEEK_OPTIONS.find((m) => m.key === peekMode);
  const projectIdentifier = getProjectIdentifierById(issueDetails?.project_id);
  const {
    issues: { removeIssue: removeArchivedIssue },
  } = useIssues(EIssuesStoreType.ARCHIVED);

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issueDetails?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issueDetails?.sequence_id,
    isArchived,
  });

  const handleCopyText = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    copyUrlToClipboard(workItemLink).then(() => {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.link_copied"),
        message: t("common.link_copied_to_clipboard"),
      });
    });
  };

  const handleDeleteIssue = async () => {
    try {
      const deleteIssue = issueDetails?.archived_at ? removeArchivedIssue : removeIssue;

      return deleteIssue(workspaceSlug, projectId, issueId).then(() => {
        setPeekIssue(undefined);
      });
    } catch (_error) {
      setToast({
        title: t("toast.error"),
        type: TOAST_TYPE.ERROR,
        message: t("entity.delete.failed", { entity: t("issue.label", { count: 1 }) }),
      });
    }
  };

  const handleArchiveIssue = async () => {
    await archiveIssue(workspaceSlug, projectId, issueId);
    // check and remove if issue is peeked
    if (getIsIssuePeeked(issueId)) {
      removeRoutePeekId();
    }
  };

  // "Full screen" isn't a drawer size — it opens the work item's own page (same
  // target as the expand button) instead of stretching the drawer into a
  // full-width overlay of the peek view.
  const handlePeekModeChange = (value: TPeekModes) => {
    if (value === "full-screen") {
      removeRoutePeekId();
      router.push(workItemLink);
      return;
    }
    setPeekMode(value);
  };

  const isFavorite = !!favoriteEntityMap[issueId];
  const handleToggleFavorite = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (isFavorite) await removeFavoriteEntity(workspaceSlug, issueId);
      else
        await addFavorite(workspaceSlug, {
          entity_type: "issue",
          entity_identifier: issueId,
          project_id: projectId,
          // Top-level name is the server-side fallback title if the task is
          // ever deleted; entity_data.name feeds the optimistic sidebar row.
          name: issueDetails?.name ?? "",
          entity_data: { name: issueDetails?.name ?? "" },
        });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: isFavorite ? "Task removed from favorites." : "Task added to favorites.",
      });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: isFavorite ? "Task could not be removed from favorites." : "Task could not be added to favorites.",
      });
    }
  };

  return (
    <div
      className={`relative flex items-center justify-between p-4 ${
        currentMode?.key === "full-screen" ? "border-b border-subtle" : ""
      }`}
    >
      {/* Window chrome (close/expand/pin/layout) and item actions (favorite/copy/more)
          share one primitive and one metric — IconButton at size "lg" (28px) — so the
          strip reads as a single row. Variant carries the grouping: ghost for the
          chrome, secondary for the actions on the right. */}
      <div className="flex items-center gap-2">
        <Tooltip tooltipContent={t("common.close_peek_view")} isMobile={isMobile}>
          <IconButton
            variant="ghost"
            size="lg"
            icon={ChevronRight}
            onClick={removeRoutePeekId}
            aria-label={t("common.close_peek_view")}
          />
        </Tooltip>

        <Tooltip tooltipContent={t("issue.open_in_full_screen")} isMobile={isMobile}>
          <Link
            href={workItemLink}
            onClick={() => removeRoutePeekId()}
            aria-label={t("issue.open_in_full_screen")}
            className={getIconButtonStyling("ghost", "lg")}
          >
            <MoveDiagonal className="size-4" />
          </Link>
        </Tooltip>
        {!embedIssue && (
          <Tooltip
            tooltipContent={isPeekPinned ? "Unpin — closes when you click away" : "Pin — stays open while you navigate"}
            isMobile={isMobile}
          >
            <IconButton
              variant="ghost"
              size="lg"
              icon={(iconProps) => <Pin {...iconProps} weight={isPeekPinned ? "Bold" : "Linear"} />}
              onClick={() => setPeekPinned(!isPeekPinned)}
              aria-label={isPeekPinned ? "Unpin peek view" : "Pin peek view"}
              className={isPeekPinned ? "text-accent-primary" : ""}
            />
          </Tooltip>
        )}
        {currentMode && embedIssue === false && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <CustomSelect
              value={currentMode}
              onChange={(val: TPeekModes) => handlePeekModeChange(val)}
              // CustomSelect renders its own <button type="button">, so the trigger is styled through
              // customButtonClassName — nesting a second <button type="button"> here would be invalid DOM.
              customButtonClassName={`${getIconButtonStyling("ghost", "lg")} justify-center`}
              customButton={
                <Tooltip tooltipContent={t("common.toggle_peek_view_layout")} isMobile={isMobile}>
                  <span className="grid place-items-center">
                    <currentMode.icon className="size-4" />
                  </span>
                </Tooltip>
              }
            >
              {PEEK_OPTIONS.map((mode) => (
                <CustomSelect.Option key={mode.key} value={mode.key}>
                  <div
                    className={`flex items-center gap-1.5 ${
                      currentMode.key === mode.key ? "text-secondary" : "text-placeholder hover:text-secondary"
                    }`}
                  >
                    <mode.icon className="-my-1 h-4 w-4 flex-shrink-0" />
                    {t(mode.i18n_title)}
                  </div>
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>
        )}
      </div>
      <div className="flex items-center gap-x-4">
        <NameDescriptionUpdateStatus isSubmitting={isSubmitting} />
        <div className="flex items-center gap-2">
          {!isArchived && (
            <Tooltip tooltipContent={isFavorite ? "Remove from favorites" : "Add to favorites"} isMobile={isMobile}>
              <FavoriteStar
                selected={isFavorite}
                onClick={handleToggleFavorite}
                buttonClassName={getIconButtonStyling("secondary", "lg")}
              />
            </Tooltip>
          )}
          <Tooltip tooltipContent={t("common.actions.copy_link")} isMobile={isMobile}>
            <IconButton variant="secondary" size="lg" onClick={handleCopyText} icon={CopyLinkIcon} />
          </Tooltip>
          {issueDetails && (
            <WorkItemDetailQuickActions
              parentRef={parentRef}
              issue={issueDetails}
              handleDelete={handleDeleteIssue}
              handleArchive={handleArchiveIssue}
              handleRestore={handleRestoreIssue}
              readOnly={disabled}
              toggleDeleteIssueModal={toggleDeleteIssueModal}
              toggleArchiveIssueModal={toggleArchiveIssueModal}
              toggleDuplicateIssueModal={toggleDuplicateIssueModal}
              toggleEditIssueModal={toggleEditIssueModal}
              isPeekMode
            />
          )}
        </div>
      </div>
    </div>
  );
});
