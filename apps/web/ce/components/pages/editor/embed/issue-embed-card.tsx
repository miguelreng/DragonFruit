/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Loader2, Plus, Sparkles } from "@/components/icons/lucide-shim";
// plane imports
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
// services
import { IssueService } from "@/services/issue";

const issueService = new IssueService();

type Props = {
  issueId: string;
  projectId: string | undefined;
  workspaceSlug: string | undefined;
  draft?: boolean;
  draftTitle?: string;
  draftDescription?: string;
  onPromoted?: (attrs: { workItemId: string; projectId: string; workspaceSlug: string }) => void;
};

export const IssueEmbedCard = observer(function IssueEmbedCard(props: Props) {
  const { issueId, projectId, workspaceSlug, draft, draftTitle, draftDescription, onPromoted } = props;

  if (draft) {
    return (
      <DraftEmbedCard
        title={draftTitle ?? ""}
        description={draftDescription ?? ""}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
        onPromoted={onPromoted}
      />
    );
  }

  return <RealEmbedCard issueId={issueId} projectId={projectId} workspaceSlug={workspaceSlug} />;
});

const RealEmbedCard = observer(function RealEmbedCard(props: {
  issueId: string;
  projectId: string | undefined;
  workspaceSlug: string | undefined;
}) {
  const { issueId, projectId, workspaceSlug } = props;
  const [hasFetchError, setHasFetchError] = useState(false);

  const { getProjectIdentifierById } = useProject();
  const {
    issue: { getIssueById },
    fetchIssue,
    updateIssue,
  } = useIssueDetail();

  const issue = getIssueById(issueId);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !issueId) return;
    if (issue) return;
    let cancelled = false;
    fetchIssue(workspaceSlug, projectId, issueId).catch(() => {
      if (!cancelled) setHasFetchError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, issueId, issue, fetchIssue]);

  const patch = useCallback(
    (data: Parameters<typeof updateIssue>[3]) => {
      if (!workspaceSlug || !projectId || !issueId) return;
      void updateIssue(workspaceSlug, projectId, issueId, data);
    },
    [updateIssue, workspaceSlug, projectId, issueId]
  );

  if (!issueId || !projectId || !workspaceSlug) {
    return <EmbedShell variant="error">Linked task — missing identifiers</EmbedShell>;
  }
  if (hasFetchError) {
    return <EmbedShell variant="error">Linked task — you don&apos;t have access</EmbedShell>;
  }
  if (!issue) {
    return <EmbedShell variant="loading">Loading task…</EmbedShell>;
  }

  const projectIdentifier = getProjectIdentifierById(projectId);
  const href = `/${workspaceSlug}/projects/${projectId}/issues/${issueId}`;

  return (
    <div
      className={cn(
        "not-prose flex w-full items-center gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 px-4 py-2 shadow-raised-100 transition-colors hover:border-strong hover:bg-surface-2"
      )}
    >
      <Link to={href} className="flex min-w-0 flex-1 items-center gap-3 no-underline">
        <span className="shrink-0 text-12 font-medium whitespace-nowrap text-tertiary">
          {projectIdentifier}-{issue.sequence_id}
        </span>
        <span className="flex-1 truncate text-14 text-primary hover:underline">{issue.name}</span>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        <StateDropdown
          value={issue.state_id}
          projectId={projectId}
          onChange={(stateId) => patch({ state_id: stateId })}
          buttonVariant="transparent-with-text"
          buttonClassName="!px-2"
          iconSize="size-3.5"
          showTooltip
        />
        <MemberDropdown
          multiple
          includeAgents
          value={issue.assignee_ids ?? []}
          projectId={projectId}
          onChange={(ids) => patch({ assignee_ids: ids })}
          buttonVariant="transparent-without-text"
          buttonClassName="!px-1"
          placeholder=""
          placement="bottom-end"
        />
        <DateDropdown
          value={issue.target_date ?? null}
          onChange={(date) => patch({ target_date: date ? renderFormattedPayloadDate(date) : null })}
          minDate={getDate(issue.start_date)}
          buttonVariant="transparent-with-text"
          buttonClassName="!px-2"
          placeholder="Due"
          placement="bottom-end"
        />
      </div>
    </div>
  );
});

function DraftEmbedCard(props: {
  title: string;
  description: string;
  projectId: string | undefined;
  workspaceSlug: string | undefined;
  onPromoted?: (attrs: { workItemId: string; projectId: string; workspaceSlug: string }) => void;
}) {
  const { title, description, projectId, workspaceSlug, onPromoted } = props;
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = Boolean(workspaceSlug && projectId && title && !isCreating);

  const handleCreate = async () => {
    if (!workspaceSlug || !projectId) return;
    setIsCreating(true);
    setError(null);
    try {
      const issue = await issueService.createIssue(workspaceSlug, projectId, {
        name: title,
        description_html: description ? `<p>${description}</p>` : undefined,
      });
      onPromoted?.({ workItemId: issue.id, projectId, workspaceSlug });
    } catch {
      setError("Couldn't create the task.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className={cn(
        "not-prose flex w-full items-start gap-3 rounded-md border-[0.5px] border-dashed border-strong bg-accent-subtle px-4 py-2.5 shadow-raised-100"
      )}
    >
      <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-11 font-semibold text-accent-primary uppercase">Draft</span>
          <span className="text-11 text-tertiary">Click create to make it real</span>
        </div>
        <p className="mt-0.5 truncate text-14 text-primary">{title || "Untitled action item"}</p>
        {description && <p className="mt-0.5 truncate text-12 text-secondary">{description}</p>}
        {error && <p className="text-error mt-1 text-12">{error}</p>}
      </div>
      <button
        type="button"
        disabled={!canCreate}
        onClick={() => void handleCreate()}
        className={cn(
          "shrink-0 self-center rounded-md border-[0.5px] border-strong bg-layer-1 px-3 py-1 text-12 font-medium text-primary transition-colors hover:bg-layer-2",
          !canCreate && "cursor-not-allowed opacity-50"
        )}
      >
        {isCreating ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            Creating…
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Plus className="size-3" />
            Create
          </span>
        )}
      </button>
    </div>
  );
}

function EmbedShell({ children, variant }: { children: React.ReactNode; variant: "loading" | "error" }) {
  return (
    <div
      className={cn(
        "flex w-full items-center rounded-md border-[0.5px] px-4 py-2.5 text-14 shadow-raised-100",
        variant === "loading" && "border-subtle bg-surface-1 text-tertiary",
        variant === "error" && "border-subtle bg-surface-1 text-secondary"
      )}
    >
      {children}
    </div>
  );
}
