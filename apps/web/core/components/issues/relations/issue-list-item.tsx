/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { LinkIcon, EditIcon, TrashIcon, CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { ControlLink, CustomMenu } from "@plane/ui";
import { generateWorkItemLink } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
import type { TIssueRelationTypes } from "@/plane-web/types";
// local imports
import { useRelationOperations } from "../issue-detail-widgets/relations/helper";
import { RelationIssueProperty } from "./properties";

type Props = {
  workspaceSlug: string;
  issueId: string;
  relationKey: TIssueRelationTypes;
  relationIssueId: string;
  disabled: boolean;
  handleIssueCrudState: (
    key: "update" | "delete" | "removeRelation",
    issueId: string,
    issue?: TIssue | null,
    relationKey?: TIssueRelationTypes | null,
    relationIssueId?: string | null
  ) => void;
  issueServiceType?: TIssueServiceType;
};

export const RelationIssueListItem = observer(function RelationIssueListItem(props: Props) {
  const {
    workspaceSlug,
    issueId,
    relationKey,
    relationIssueId,
    disabled = false,
    handleIssueCrudState,
    issueServiceType = EIssueServiceType.ISSUES,
  } = props;

  const { t } = useTranslation();

  // store hooks
  const {
    issue: { getIssueById },
    removeRelation,
    updateRelationCustomLabel,
    toggleCreateIssueModal,
    toggleDeleteIssueModal,
  } = useIssueDetail(issueServiceType);
  const project = useProject();
  const { isMobile } = usePlatformOS();
  // derived values
  const issue = getIssueById(relationIssueId);
  const { handleRedirection } = useIssuePeekOverviewRedirection(!!issue?.is_epic);
  const issueOperations = useRelationOperations(issue?.is_epic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  const projectDetail = (issue && issue.project_id && project.getProjectById(issue.project_id)) || undefined;
  const projectId = issue?.project_id;

  if (!issue || !projectId) return <></>;

  const workItemLink = generateWorkItemLink({
    workspaceSlug: workspaceSlug.toString(),
    projectId: issue?.project_id,
    issueId: issue?.id,
    projectIdentifier: projectDetail?.identifier,
    sequenceId: issue?.sequence_id,
    isEpic: issue?.is_epic,
  });

  // handlers
  // Param is named `targetIssue` instead of `issue` to avoid shadowing the
  // outer-scope `const issue` from getIssueById above. Functionally identical.
  const handleIssuePeekOverview = (targetIssue: TIssue) => {
    if (targetIssue.is_epic) {
      // open epics in new tab
      window.open(workItemLink, "_blank");
      return;
    }
    handleRedirection(workspaceSlug, targetIssue, isMobile);
  };

  const handleEditIssue = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    e.preventDefault();
    handleIssueCrudState("update", relationIssueId, { ...issue });
    toggleCreateIssueModal(true);
  };

  const handleDeleteIssue = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    e.preventDefault();
    handleIssueCrudState("delete", relationIssueId, issue);
    toggleDeleteIssueModal(relationIssueId);
    handleIssueCrudState("removeRelation", issueId, issue, relationKey, relationIssueId);
  };

  const handleCopyIssueLink = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    e.preventDefault();
    issueOperations.copyLink(workItemLink);
  };

  const handleRemoveRelation = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();
    e.stopPropagation();
    removeRelation(workspaceSlug, projectId, issueId, relationKey, relationIssueId);
  };

  // Inline-edit state for the custom_label chip. Editing starts when the
  // user clicks the chip (or the hover-only "add label" affordance for
  // unlabeled relations). ENTER/blur saves; ESC cancels.
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingLabel) {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    }
  }, [isEditingLabel]);

  const handleStartLabelEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setLabelDraft(issue.custom_label ?? "");
    setIsEditingLabel(true);
  };

  const handleSaveLabel = async () => {
    if (!isEditingLabel) return;
    const trimmed = labelDraft.trim();
    const current = issue.custom_label ?? "";
    setIsEditingLabel(false);
    // No-op if unchanged — saves a wasted network round-trip.
    if (trimmed === current) return;
    try {
      await updateRelationCustomLabel(workspaceSlug, projectId, issueId, relationIssueId, trimmed);
    } catch (error) {
      console.error("Failed to update relation label:", error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: "Couldn't save the relation label. Please try again.",
      });
    }
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveLabel();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditingLabel(false);
    }
  };

  return (
    <div key={relationIssueId}>
      <ControlLink
        id={`issue-${issue.id}`}
        href={workItemLink}
        onClick={() => handleIssuePeekOverview(issue)}
        className="w-full cursor-pointer"
      >
        {issue && (
          <div className="group relative flex h-full min-h-11 w-full items-center px-1.5 py-1 transition-all hover:bg-surface-2">
            <span className="size-5 flex-shrink-0" />
            <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
              <div className="flex-shrink-0">
                {projectDetail && (
                  <IssueIdentifier
                    projectId={projectDetail.id}
                    issueTypeId={issue.type_id}
                    projectIdentifier={projectDetail.identifier}
                    issueSequenceId={issue.sequence_id}
                    size="xs"
                    variant="secondary"
                  />
                )}
              </div>

              <Tooltip tooltipContent={issue.name} isMobile={isMobile}>
                <span className="w-0 flex-1 truncate text-13 text-primary">{issue.name}</span>
              </Tooltip>
              {/* User-defined relation label — three render states:
                    - editing: input, ENTER/blur to save, ESC to cancel
                    - has label: clickable chip (click to edit)
                    - no label: hover-only "+ Label" affordance (click to add)
                  All three skipped when disabled so read-only callers don't
                  expose mutation surface. */}
              {isEditingLabel ? (
                <input
                  ref={labelInputRef}
                  type="text"
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={handleLabelKeyDown}
                  onBlur={handleSaveLabel}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  placeholder='e.g. "Stakeholder"'
                  maxLength={120}
                  className="focus:border-primary flex-shrink-0 rounded-sm border border-strong bg-surface-1 px-1.5 py-0.5 text-11 text-primary placeholder:text-placeholder focus:outline-none"
                  style={{ width: "11rem" }}
                />
              ) : issue.custom_label ? (
                <button
                  type="button"
                  onClick={handleStartLabelEdit}
                  disabled={disabled}
                  className="flex-shrink-0 rounded-sm border border-subtle bg-surface-2 px-1.5 py-0.5 text-11 text-secondary transition-colors hover:border-strong hover:text-primary disabled:cursor-default disabled:hover:border-subtle disabled:hover:text-secondary"
                >
                  {issue.custom_label}
                </button>
              ) : (
                !disabled && (
                  <button
                    type="button"
                    onClick={handleStartLabelEdit}
                    className="hidden flex-shrink-0 rounded-sm border border-dashed border-subtle px-1.5 py-0.5 text-11 text-tertiary opacity-0 transition-all group-hover:flex group-hover:opacity-100 hover:border-strong hover:text-secondary"
                  >
                    + Label
                  </button>
                )
              )}
            </div>
            <div
              role="presentation"
              className="flex-shrink-0 text-13"
              // Click absorber so taps on the inline properties don't bubble
              // up to the row's <ControlLink> and trigger navigation. Inner
              // controls carry the real semantics; this wrapper is decorative.
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
              }}
            >
              <RelationIssueProperty
                workspaceSlug={workspaceSlug}
                issueId={relationIssueId}
                disabled={disabled}
                issueOperations={issueOperations}
                issueServiceType={issueServiceType}
              />
            </div>
            <div className="flex-shrink-0 pl-2 text-13">
              <CustomMenu placement="bottom-end" ellipsis>
                {!disabled && (
                  <CustomMenu.MenuItem onClick={handleEditIssue}>
                    <div className="flex items-center gap-2">
                      <EditIcon className="h-3.5 w-3.5" strokeWidth={2} />
                      <span>{t("common.actions.edit")}</span>
                    </div>
                  </CustomMenu.MenuItem>
                )}

                <CustomMenu.MenuItem onClick={handleCopyIssueLink}>
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-3.5 w-3.5" strokeWidth={2} />
                    <span>{t("common.actions.copy_link")}</span>
                  </div>
                </CustomMenu.MenuItem>

                {!disabled && (
                  <CustomMenu.MenuItem onClick={handleRemoveRelation}>
                    <div className="flex items-center gap-2">
                      <CloseIcon className="h-3.5 w-3.5" strokeWidth={2} />
                      <span>{t("common.actions.remove_relation")}</span>
                    </div>
                  </CustomMenu.MenuItem>
                )}

                {!disabled && (
                  <CustomMenu.MenuItem onClick={handleDeleteIssue}>
                    <div className="flex items-center gap-2">
                      <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
                      <span>{t("common.actions.delete")}</span>
                    </div>
                  </CustomMenu.MenuItem>
                )}
              </CustomMenu>
            </div>
          </div>
        )}
      </ControlLink>
    </div>
  );
});
