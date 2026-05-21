/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState, useCallback } from "react";
import { observer } from "mobx-react";
import type { TIssue, TIssueServiceType } from "@plane/types";
import { EIssueServiceType, EIssuesStoreType } from "@plane/types";
// components
import { DeleteIssueModal } from "@/components/issues/delete-issue-modal";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { CreateUpdateIssueModal } from "../../issue-modal/modal";
import { useSubIssueOperations } from "./helper";
import { InlineCreateSubIssue } from "./inline-create";
import { SubIssuesListRoot } from "./issues-list/root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  parentIssueId: string;
  disabled: boolean;
  issueServiceType?: TIssueServiceType;
};

type TIssueCrudState = { toggle: boolean; parentIssueId: string | undefined; issue: TIssue | undefined };

export const SubIssuesCollapsibleContent = observer(function SubIssuesCollapsibleContent(props: Props) {
  const { workspaceSlug, projectId, parentIssueId, disabled, issueServiceType = EIssueServiceType.ISSUES } = props;
  // state
  const [issueCrudState, setIssueCrudState] = useState<{
    create: TIssueCrudState;
    existing: TIssueCrudState;
    update: TIssueCrudState;
    delete: TIssueCrudState;
  }>({
    create: {
      toggle: false,
      parentIssueId: undefined,
      issue: undefined,
    },
    existing: {
      toggle: false,
      parentIssueId: undefined,
      issue: undefined,
    },
    update: {
      toggle: false,
      parentIssueId: undefined,
      issue: undefined,
    },
    delete: {
      toggle: false,
      parentIssueId: undefined,
      issue: undefined,
    },
  });
  // store hooks
  const { toggleCreateIssueModal, toggleDeleteIssueModal } = useIssueDetail(issueServiceType);

  // helpers
  const subIssueOperations = useSubIssueOperations(issueServiceType);

  // handler
  const handleIssueCrudState = useCallback(
    (key: "create" | "existing" | "update" | "delete", _parentIssueId: string | null, issue: TIssue | null = null) => {
      setIssueCrudState({
        ...issueCrudState,
        [key]: {
          toggle: !issueCrudState[key].toggle,
          parentIssueId: _parentIssueId,
          issue,
        },
      });
    },
    [issueCrudState]
  );

  const handleFetchSubIssues = useCallback(async () => {
    // Always (re)fetch on parent change. The previous gate consulted
    // `issue_visibility` to skip refetches, but `setSubIssueHelpers` is a
    // toggle (add-or-remove on each call) so a second invocation would
    // silently REMOVE the id again — which left the visibility gate stuck
    // closed and the subtask list invisible even though the data had
    // arrived. We now drive rendering from the data itself (see below).
    try {
      await subIssueOperations.fetchSubIssues(workspaceSlug, projectId, parentIssueId);
    } catch (error) {
      console.error("Error fetching sub-tasks:", error);
    }
  }, [parentIssueId, projectId, subIssueOperations, workspaceSlug]);

  useEffect(() => {
    handleFetchSubIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentIssueId]);

  // render conditions
  const shouldRenderDeleteIssueModal =
    issueCrudState?.delete?.toggle &&
    issueCrudState?.delete?.issue &&
    issueCrudState.delete.parentIssueId &&
    issueCrudState.delete.issue.id;

  const shouldRenderUpdateIssueModal = issueCrudState?.update?.toggle && issueCrudState?.update?.issue;

  return (
    <>
      {/* Always render. SubIssuesListRoot internally renders nothing when
       * the store hasn't loaded the sub-issue IDs yet, and shows its own
       * empty state when filters exclude everything — so we don't need
       * an outer visibility gate (which previously got stuck closed; see
       * handleFetchSubIssues above). */}
      <SubIssuesListRoot
        storeType={EIssuesStoreType.PROJECT}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        parentIssueId={parentIssueId}
        rootIssueId={parentIssueId}
        spacingLeft={6}
        canEdit={!disabled}
        handleIssueCrudState={handleIssueCrudState}
        subIssueOperations={subIssueOperations}
        issueServiceType={issueServiceType}
      />

      {/* Inline "+ Add subtask" — the modal route is still available via
          the dropdown on the section title for users who want to set
          assignee/labels/dates at creation time. This is the fast path. */}
      {!disabled && (
        <InlineCreateSubIssue
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          parentIssueId={parentIssueId}
          subIssueOperations={subIssueOperations}
        />
      )}

      {shouldRenderDeleteIssueModal && (
        <DeleteIssueModal
          isOpen={issueCrudState?.delete?.toggle}
          handleClose={() => {
            handleIssueCrudState("delete", null, null);
            toggleDeleteIssueModal(null);
          }}
          data={issueCrudState?.delete?.issue as TIssue}
          onSubmit={async () =>
            await subIssueOperations.deleteSubIssue(
              workspaceSlug,
              projectId,
              issueCrudState?.delete?.parentIssueId as string,
              issueCrudState?.delete?.issue?.id as string
            )
          }
          isSubIssue
        />
      )}

      {shouldRenderUpdateIssueModal && (
        <CreateUpdateIssueModal
          isOpen={issueCrudState?.update?.toggle}
          onClose={() => {
            handleIssueCrudState("update", null, null);
            toggleCreateIssueModal(false);
          }}
          data={issueCrudState?.update?.issue ?? undefined}
          onSubmit={async (_issue: TIssue) => {
            await subIssueOperations.updateSubIssue(
              workspaceSlug,
              projectId,
              parentIssueId,
              _issue.id,
              _issue,
              issueCrudState?.update?.issue,
              true
            );
          }}
        />
      )}
    </>
  );
});
