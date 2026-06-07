/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
// plane imports
import type { TCallbackMentionComponentProps } from "@plane/editor";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";

export type TEditorMentionComponentProps = TCallbackMentionComponentProps;

export function EditorAdditionalMentionsRoot(props: TEditorMentionComponentProps) {
  const { entity_identifier, entity_name } = props;
  if (entity_name === "issue" && entity_identifier) {
    return <EditorWorkItemMention issueId={entity_identifier} />;
  }
  return null;
}

const chipClassName =
  "not-prose inline rounded-lg bg-accent-subtle-active px-1 py-0.5 text-accent-primary no-underline";

const EditorWorkItemMention = observer(function EditorWorkItemMention(props: { issueId: string }) {
  const { issueId } = props;
  // route gives us the doc's workspace + project; the @-search is project-scoped
  // so a mentioned work item belongs to this project.
  const { workspaceSlug, projectId } = useParams();
  const ws = workspaceSlug?.toString();
  const pid = projectId?.toString();
  // store hooks
  const { getProjectIdentifierById } = useProject();
  const {
    issue: { getIssueById },
    fetchIssue,
  } = useIssueDetail();
  // derived values
  const issue = getIssueById(issueId);

  // Resolve the work item if it isn't already in the store (e.g. after reload).
  useEffect(() => {
    if (!ws || !pid || !issueId || issue) return;
    void fetchIssue(ws, pid, issueId).catch(() => {});
  }, [ws, pid, issueId, issue, fetchIssue]);

  const identifier = issue?.project_id ? getProjectIdentifierById(issue.project_id) : undefined;
  const label = issue && identifier ? `${identifier}-${issue.sequence_id}` : "work item";
  const href = ws && pid ? `/${ws}/projects/${pid}/issues/${issueId}` : "#";

  return (
    <Link to={href} className={cn(chipClassName)} title={issue?.name ?? undefined}>
      @{label}
      {issue?.name ? <span className="font-normal opacity-80"> {issue.name}</span> : null}
    </Link>
  );
});
