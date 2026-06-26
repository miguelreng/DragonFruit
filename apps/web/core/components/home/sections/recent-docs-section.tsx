/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy } from "lodash-es";
import Link from "next/link";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { DocumentText } from "@solar-icons/react/ssr";
import type { TPage } from "@plane/types";
import { calculateTimeAgo, getPageName } from "@plane/utils";
import { isBriefPageName } from "@/components/project/brief/constants";
import { ProjectPageService } from "@/services/page/project-page.service";

// Matches the inspo's four-up "study plan" row.
const PREVIEW_COUNT = 4;
const pageService = new ProjectPageService();

const RecentDocTile = observer(function RecentDocTile({ doc, slug }: { doc: TPage; slug: string }) {
  const projectId = doc.project_ids?.[0];
  const docLink = projectId ? `/${slug}/projects/${projectId}/pages/${doc.id}/` : `/${slug}/pages/${doc.id}`;

  return (
    <Link
      href={docLink}
      className="group flex min-w-0 flex-1 flex-col gap-3 px-4 first:pl-2 last:pr-2"
      title={getPageName(doc.name)}
    >
      <DocumentText
        weight="BoldDuotone"
        className="size-14 text-placeholder transition-colors group-hover:text-tertiary"
      />
      <div className="min-w-0">
        <p className="truncate text-13 font-medium text-secondary transition-colors group-hover:text-primary">
          {getPageName(doc.name)}
        </p>
        {doc.updated_at && (
          <p className="mt-0.5 truncate text-11 text-placeholder">Edited {calculateTimeAgo(doc.updated_at)}</p>
        )}
      </div>
    </Link>
  );
});

export const RecentDocsSection = observer(function RecentDocsSection() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();

  // Reuses the same SWR key/fetcher as the Docs page so the list is warm there.
  const { data: pages, isLoading } = useSWR(
    slug ? `WORKSPACE_PAGES_${slug}_doc` : null,
    slug ? () => pageService.fetchWorkspacePages(slug, "doc") : null
  );

  const docs = orderBy(
    (pages ?? []).filter((p) => !p.archived_at && (p.page_type ?? "doc") === "doc" && !isBriefPageName(p.name)),
    [(p) => p.updated_at],
    ["desc"]
  ).slice(0, PREVIEW_COUNT);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <DocumentText weight="Linear" className="size-4 text-tertiary" />
          <h3 className="text-14 font-semibold text-secondary">Recent docs</h3>
        </div>
        {slug && (
          <Link href={`/${slug}/docs`} className="text-11 font-medium text-placeholder hover:text-secondary">
            All docs
          </Link>
        )}
      </div>
      {isLoading && !pages ? (
        <div className="px-2 py-6 text-12 text-placeholder">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="px-2 py-6 text-12 text-placeholder">No docs yet. Create one to see it here.</div>
      ) : (
        <div className="flex divide-x divide-subtle">
          {slug && docs.map((doc) => <RecentDocTile key={doc.id} doc={doc} slug={slug} />)}
        </div>
      )}
    </section>
  );
});
