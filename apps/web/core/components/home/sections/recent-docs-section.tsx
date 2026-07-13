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
import type { TPage, TPageType } from "@plane/types";
import { calculateTimeAgo, getPageName } from "@plane/utils";
import { DOC_CARD_STYLE_STORAGE_KEY, DocPreviewCard, type TDocCardStyle } from "@/components/docs/doc-card-preview";
import { isBriefPage } from "@/components/project/brief/constants";
import { useProject } from "@/hooks/store/use-project";
import useLocalStorage from "@/hooks/use-local-storage";
import { ProjectPageService } from "@/services/page/project-page.service";

// Matches the inspo's four-up "study plan" row.
const PREVIEW_COUNT = 4;
const RECENT_PAGE_TYPES: TPageType[] = ["doc", "pdf", "sheet"];
const RECENT_PAGE_TYPES_KEY = RECENT_PAGE_TYPES.join("_");
const pageService = new ProjectPageService();

const RecentDocTile = observer(function RecentDocTile({
  doc,
  slug,
  cardStyle,
}: {
  doc: TPage;
  slug: string;
  cardStyle: TDocCardStyle;
}) {
  const { getProjectById } = useProject();
  const projectId = doc.project_ids?.[0];
  const docLink = projectId ? `/${slug}/projects/${projectId}/pages/${doc.id}/` : `/${slug}/pages/${doc.id}`;
  const metaText = [
    projectId ? getProjectById(projectId)?.name : undefined,
    doc.updated_at ? `Updated ${calculateTimeAgo(doc.updated_at)}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={docLink} className="block min-w-0" title={getPageName(doc.name)}>
      <DocPreviewCard page={doc} workspaceSlug={slug} style={cardStyle} meta={metaText} footer={metaText} />
    </Link>
  );
});

export const RecentDocsSection = observer(function RecentDocsSection() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  // Follows the docs gallery's paper/tile pick so both surfaces match.
  const { storedValue: storedCardStyle } = useLocalStorage<TDocCardStyle>(DOC_CARD_STYLE_STORAGE_KEY, "paper");
  const cardStyle: TDocCardStyle = storedCardStyle ?? "paper";

  // Reuses the same SWR key/fetcher as the Docs page so the list is warm there.
  const { data: pages, isLoading } = useSWR(
    slug ? `WORKSPACE_PAGES_${slug}_${RECENT_PAGE_TYPES_KEY}` : null,
    slug ? () => pageService.fetchWorkspacePages(slug) : null
  );

  const docs = orderBy(
    (pages ?? []).filter((p) => !p.archived_at && RECENT_PAGE_TYPES.includes(p.page_type ?? "doc") && !isBriefPage(p)),
    [(p) => p.updated_at],
    ["desc"]
  ).slice(0, PREVIEW_COUNT);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
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
        <div className="px-2 py-6 text-12 text-placeholder">
          No docs, PDFs, or sheets yet. Create one to see it here.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {slug && docs.map((doc) => <RecentDocTile key={doc.id} doc={doc} slug={slug} cardStyle={cardStyle} />)}
        </div>
      )}
    </section>
  );
});
