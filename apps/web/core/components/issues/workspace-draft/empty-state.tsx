/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useState } from "react";
import { observer } from "mobx-react";
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EIssuesStoreType, EUserWorkspaceRoles } from "@plane/types";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { RenaissanceDraftIllustration } from "@/components/drafts/renaissance-draft-illustration";
// constants
import { useUserPermissions } from "@/hooks/store/user";

export const WorkspaceDraftEmptyState = observer(function WorkspaceDraftEmptyState() {
  // state
  const [isDraftIssueModalOpen, setIsDraftIssueModalOpen] = useState(false);
  // store hooks
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const canPerformEmptyStateActions = allowPermissions(
    [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  return (
    <Fragment>
      <CreateUpdateIssueModal
        isOpen={isDraftIssueModalOpen}
        storeType={EIssuesStoreType.WORKSPACE_DRAFT}
        onClose={() => setIsDraftIssueModalOpen(false)}
        isDraft
      />
      <div className="flex w-full flex-col items-center justify-center gap-6 py-12 text-center">
        <RenaissanceDraftIllustration className="w-44" />
        <div className="flex max-w-md flex-col items-center gap-2">
          <h3 className="text-16 leading-7 font-semibold text-primary">{t("workspace_empty_state.drafts.title")}</h3>
          <p className="text-13 leading-5 text-tertiary">{t("workspace_empty_state.drafts.description")}</p>
        </div>
        <Button
          variant="primary"
          size="xl"
          onClick={() => setIsDraftIssueModalOpen(true)}
          disabled={!canPerformEmptyStateActions}
        >
          {t("workspace_empty_state.drafts.cta_primary")}
        </Button>
      </div>
    </Fragment>
  );
});
