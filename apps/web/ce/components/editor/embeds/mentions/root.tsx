/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
// plane imports
import { fetchWikipediaSummary } from "@plane/editor";
import type { TCallbackMentionComponentProps, TWikipediaSummary } from "@plane/editor";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";
// components
import { PageIcon } from "@/components/icons/propel-shim";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

export type TEditorMentionComponentProps = TCallbackMentionComponentProps;

export function EditorAdditionalMentionsRoot(props: TEditorMentionComponentProps) {
  const { entity_identifier, entity_name } = props;
  if (entity_name === "issue" && entity_identifier) {
    return <EditorWorkItemMention issueId={entity_identifier} />;
  }
  if (entity_name === "page" && entity_identifier) {
    return <EditorPageMention pageId={entity_identifier} />;
  }
  if (entity_name === "wiki" && entity_identifier) {
    return <EditorWikiMention articleUrl={entity_identifier} />;
  }
  return null;
}

const chipClassName =
  "not-prose inline rounded-lg bg-accent-subtle-active px-1 py-0.5 text-accent-primary no-underline";

// Page links read as inline hyperlinks (icon + title, underlined) rather than
// the accent chip used for @-mentions of users/work items.
const pageLinkClassName =
  "not-prose inline font-medium text-accent-primary underline decoration-accent-primary/40 underline-offset-2 hover:decoration-accent-primary [&>span]:mr-0.5";

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

/**
 * EditorPageMention — renders an inline link to another doc/page.
 *
 * The @-search is project-scoped, so a mentioned page belongs to the doc's
 * current project; we resolve its title from the project page store (lazily
 * fetching it if it isn't cached yet, e.g. after a reload) and link to it.
 */
const EditorPageMention = observer(function EditorPageMention(props: { pageId: string }) {
  const { pageId } = props;
  const { workspaceSlug, projectId } = useParams();
  const ws = workspaceSlug?.toString();
  const pid = projectId?.toString();
  // store hooks
  const { getPageById, fetchPageDetails } = usePageStore(EPageStoreType.PROJECT);
  // derived values
  const page = getPageById(pageId);

  // Resolve the page if it isn't already in the store (e.g. after reload).
  useEffect(() => {
    if (!ws || !pid || !pageId || page) return;
    void fetchPageDetails(ws, pid, pageId, { trackVisit: false }).catch(() => {});
  }, [ws, pid, pageId, page, fetchPageDetails]);

  const label = page?.name || "Untitled";
  const redirectProjectId = page?.project_ids?.[0] ?? pid;
  const href = ws && redirectProjectId ? `/${ws}/projects/${redirectProjectId}/pages/${pageId}` : "#";

  return (
    <Link to={href} className={cn(pageLinkClassName)} title={page?.name ?? undefined}>
      <span className="inline-flex size-3.5 flex-shrink-0 items-center justify-center align-text-bottom">
        {page?.logo_props?.in_use ? (
          <Logo logo={page.logo_props} size={14} type="lucide" />
        ) : (
          <PageIcon className="size-3.5" />
        )}
      </span>
      {label}
    </Link>
  );
});

/**
 * EditorWikiMention — renders a Wikipedia article mention inline.
 *
 * entity_identifier is the full desktop Wikipedia article URL
 * (e.g. "https://en.wikipedia.org/wiki/Photosynthesis").
 *
 * On hover it fetches the article summary (title, extract, thumbnail) via the
 * Wikipedia REST API and shows a popover card, reusing the same
 * `@plane/propel/popover` primitive used by EditorUserMention.
 *
 * The popover is controlled via open/onOpenChange to enable hover-to-open
 * behaviour without relying on non-standard Popover props.
 */
const EditorWikiMention = function EditorWikiMention(props: { articleUrl: string }) {
  const { articleUrl } = props;

  // Derive a human-readable title from the URL slug as the default label.
  const slugTitle = (() => {
    try {
      const parts = new URL(articleUrl).pathname.split("/");
      return decodeURIComponent(parts[parts.length - 1] ?? "").replace(/_/g, " ");
    } catch {
      return "Wikipedia";
    }
  })();

  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<TWikipediaSummary | null>(null);
  const [fetched, setFetched] = useState(false);

  // Fetch the article summary lazily on first hover open.
  const handleOpen = () => {
    setOpen(true);
    if (fetched) return;
    setFetched(true);
    void fetchWikipediaSummary(slugTitle).then((result) => {
      if (result) setSummary(result);
      return undefined;
    });
  };

  const displayTitle = summary?.title ?? slugTitle;

  return (
    <span className={cn(chipClassName)}>
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Button onMouseEnter={handleOpen} onMouseLeave={() => setOpen(false)}>
          <a href={articleUrl} target="_blank" rel="noopener noreferrer">
            @{displayTitle}
          </a>
        </Popover.Button>
        <Popover.Panel
          side="bottom"
          align="start"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="w-72 rounded-lg border-[0.5px] border-strong bg-surface-1 p-3 shadow-raised-200">
            {summary ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  {summary.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={summary.thumbnail}
                      alt={summary.title}
                      className="size-12 flex-shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <a
                      href={summary.url || articleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="not-prose text-13 font-medium text-primary hover:underline"
                    >
                      {summary.title}
                    </a>
                    {summary.extract && <p className="mt-1 line-clamp-3 text-11 text-secondary">{summary.extract}</p>}
                  </div>
                </div>
                <p className="text-10 text-tertiary">Wikipedia</p>
              </div>
            ) : (
              <p className="text-12 text-tertiary">Loading…</p>
            )}
          </div>
        </Popover.Panel>
      </Popover>
    </span>
  );
};
