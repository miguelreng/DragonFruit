/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { ListChecks as WorkItemsIcon, Plus as PlusIcon } from "@/components/icons/lucide-shim";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssue, TIssueServiceType } from "@plane/types";
import { Tooltip } from "@plane/propel/tooltip";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type Props = {
  issueId: string;
  customButton?: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

export const SubIssuesActionButton = observer(function SubIssuesActionButton(props: Props) {
  const { issueId, customButton, disabled = false, issueServiceType } = props;
  // translation
  const { t } = useTranslation();
  // store hooks
  const {
    issue: { getIssueById },
    requestInlineSubIssueCreate,
  } = useIssueDetail(issueServiceType);

  // derived values
  const issue = getIssueById(issueId);

  if (!issue) return <></>;

  const handleCreateInline = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (disabled) return;
    requestInlineSubIssueCreate(issueId);
  };

  if (customButton && React.isValidElement(customButton)) {
    return React.cloneElement(customButton, { onClick: handleCreateInline } as React.HTMLAttributes<HTMLElement>);
  }

  return (
    <Tooltip tooltipContent={t("sub_work_item.add.inline")} isMobile={false}>
      <button
        type="button"
        disabled={disabled}
        aria-label={t("sub_work_item.add.inline")}
        onClick={handleCreateInline}
        className="grid size-7 place-items-center rounded text-secondary transition-colors hover:bg-surface-2 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
});

export const AddExistingSubIssueButton = observer(function AddExistingSubIssueButton(props: Props) {
  const { issueId, customButton, disabled = false, issueServiceType } = props;
  // translation
  const { t } = useTranslation();
  // store hooks
  const {
    issue: { getIssueById },
    toggleSubIssuesModal,
    setIssueCrudOperationState,
    issueCrudOperationState,
  } = useIssueDetail(issueServiceType);

  // derived values
  const issue = getIssueById(issueId);

  if (!issue) return <></>;

  // handlers
  const handleIssueCrudState = (
    key: "existing",
    _parentIssueId: string | undefined,
    issue: TIssue | undefined = undefined
  ) => {
    setIssueCrudOperationState({
      ...issueCrudOperationState,
      [key]: {
        toggle: !issueCrudOperationState[key].toggle,
        parentIssueId: _parentIssueId,
        issue: issue,
      },
    });
  };

  const handleAddExisting = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (disabled) return;
    handleIssueCrudState("existing", issueId);
    toggleSubIssuesModal(issue.id);
  };

  if (customButton && React.isValidElement(customButton)) {
    return React.cloneElement(customButton, { onClick: handleAddExisting } as React.HTMLAttributes<HTMLElement>);
  }

  return (
    <Tooltip tooltipContent={t("common.add_existing")} isMobile={false}>
      <button
        type="button"
        disabled={disabled}
        aria-label={t("common.add_existing")}
        onClick={handleAddExisting}
        className="grid place-items-center rounded-lg p-1 text-primary transition-all duration-200 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <WorkItemsIcon className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
});
