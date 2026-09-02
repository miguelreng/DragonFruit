/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import { useTranslation } from "@dragonfruit/i18n";
// assets
// components
import { AppLoadingScreen } from "@/components/common/app-loading-screen";
import { EmptyState } from "@/components/common/empty-state";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// services
import { IssueService } from "@/services/issue/issue.service";
// types
import type { Route } from "./+types/page";

const issueService = new IssueService();

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const { workspaceSlug, projectId, issueId } = params;

  try {
    const data = await issueService.getIssueMetaFromURL(workspaceSlug, projectId, issueId);

    if (data) {
      throw redirect(`/${workspaceSlug}/browse/${data.project_identifier}-${data.sequence_id}`);
    }

    return { error: true, workspaceSlug };
  } catch (error) {
    // If it's a redirect, rethrow it
    if (error instanceof Response) {
      throw error;
    }
    // Otherwise return error state
    return { error: true, workspaceSlug };
  }
}

export default function IssueDetailsPage({ loaderData }: Route.ComponentProps) {
  const router = useAppRouter();
  const { t } = useTranslation();

  if (loaderData.error) {
    return (
      <div className="flex size-full items-center justify-center">
        <EmptyState
          iconName="search"
          title={t("issue.empty_state.issue_detail.title")}
          description={t("issue.empty_state.issue_detail.description")}
          primaryButton={{
            text: t("issue.empty_state.issue_detail.primary_button.text"),
            onClick: () => router.push(`/${loaderData.workspaceSlug}/`),
          }}
        />
      </div>
    );
  }

  return <AppLoadingScreen />;
}
