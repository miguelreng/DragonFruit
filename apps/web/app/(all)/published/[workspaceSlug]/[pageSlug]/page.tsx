/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import useSWR from "swr";
import { SitesProjectPublishService } from "@plane/services";
import { PublicPageService } from "@/services/page/public-page.service";
import dragonFruitLogo from "@/app/assets/plane-logos/logo-black.svg?url";
import { renderFormattedDate } from "@plane/utils";
import {
  addPublicDocHeadingIds,
  getPublicDocHeadings,
  PublicDocContent,
  PublicDocIndex,
  PublicDocWikiHoverCard,
  transformPublicDocMentions,
} from "@/components/pages/published/public-doc-content";
import { PublishedWikiView } from "@/components/pages/published/published-wiki-view";
import { getPublishedBriefTitle, isBriefPage } from "@/components/project/brief/constants";
import { normalizeDocFontStyle } from "@/helpers/doc-font";
import { applyPublicPageMetadata, buildPublicPageMetadata } from "@/helpers/public-page-metadata";
import { applyPublicPageLightTheme } from "@/helpers/public-page-theme";
import { buildPublicPageUrl, getPublicPageContentType } from "@/helpers/page-public";
import { buildPublishedProjectCalendarUrl } from "@/components/project/publish-project/public-link";
import type { Route } from "./+types/page";

const publicPageService = new PublicPageService();
const projectPublishService = new SitesProjectPublishService();

const PublicPageShell = ({ children }: { children: ReactNode }) => (
  <div data-theme="light" className="public-page-light min-h-full bg-white text-primary">
    <div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col px-5 sm:px-8">
      <main className="flex-1 py-12 sm:py-16">{children}</main>
      <footer className="flex justify-center py-8">
        <img src={dragonFruitLogo} alt="Dragon Fruit" className="h-7 w-auto opacity-35" />
      </footer>
    </div>
  </div>
);

const formatPublicAuthorHandle = (displayName?: string) => {
  const handle = displayName
    ?.trim()
    .replace(/^@/, "")
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");

  return handle ? `@${handle}` : null;
};

function PublishedPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, pageSlug } = params;

  useLayoutEffect(() => applyPublicPageLightTheme(), []);

  const { data, error, isLoading } = useSWR(
    workspaceSlug && pageSlug ? `PUBLIC_PAGE_${workspaceSlug}_${pageSlug}` : null,
    () => publicPageService.retrieve(workspaceSlug, pageSlug),
    { revalidateOnFocus: false }
  );
  const isProjectBriefPage = isBriefPage(data);
  const calendarProjectId =
    data?.project_id && data.description_html.includes('entity_name="calendar"') ? data.project_id : null;
  const projectSettingsProjectId = isProjectBriefPage ? data?.project_id : calendarProjectId;
  const { data: projectPublishSettings } = useSWR(
    projectSettingsProjectId ? `PUBLIC_PROJECT_SETTINGS_${workspaceSlug}_${projectSettingsProjectId}` : null,
    () => projectPublishService.retrieveSettingsByProjectId(workspaceSlug, projectSettingsProjectId ?? ""),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const mentions = useMemo(() => {
    const anchor = projectPublishSettings?.anchor;
    const calendars = { ...data?.mentions?.calendars };
    if (calendarProjectId) delete calendars[calendarProjectId];
    if (!calendarProjectId || !anchor) return { ...data?.mentions, calendars };

    const projectName = projectPublishSettings.project_details?.name?.trim();
    return {
      ...data?.mentions,
      calendars: {
        ...calendars,
        [calendarProjectId]: {
          label: projectName ? `${projectName} calendar` : "Project calendar",
          href: buildPublishedProjectCalendarUrl(workspaceSlug, anchor, {
            currentOrigin: typeof window === "undefined" ? "" : window.location.origin,
          }),
        },
      },
    };
  }, [calendarProjectId, data?.mentions, projectPublishSettings, workspaceSlug]);
  const docHtml = useMemo(
    () => addPublicDocHeadingIds(transformPublicDocMentions(data?.description_html || "<p></p>", mentions)),
    [data?.description_html, mentions]
  );
  const docHeadings = useMemo(() => getPublicDocHeadings(docHtml), [docHtml]);
  const pageTitle = getPublishedBriefTitle(data, projectPublishSettings?.project_details?.name);
  const publicPageMetadata = useMemo(() => {
    if (!data) return null;

    const contentType = getPublicPageContentType(data);
    const canonicalUrl = buildPublicPageUrl(workspaceSlug, pageSlug, contentType);
    return buildPublicPageMetadata({
      canonicalUrl,
      contentType,
      descriptionHtml: data.description_html,
      pageSlug,
      pageTitle,
      updatedAt: data.updated_at,
      workspaceSlug,
    });
  }, [data, pageSlug, pageTitle, workspaceSlug]);

  useEffect(() => {
    if (!publicPageMetadata) return undefined;
    return applyPublicPageMetadata(publicPageMetadata);
  }, [publicPageMetadata]);

  if (isLoading) {
    return <PublicPageShell>{null}</PublicPageShell>;
  }

  if (error || !data) {
    return (
      <PublicPageShell>
        <div className="mx-auto w-full max-w-md px-4 text-center">
          <h1 className="text-22 font-semibold text-primary">Page not found</h1>
          <p className="mt-2 text-14 leading-6 text-secondary">
            This published page doesn&apos;t exist, is private, or was removed.
          </p>
        </div>
      </PublicPageShell>
    );
  }

  // Published wiki folders get the full-viewport reader instead of the doc shell.
  if (data.page_type === "folder") {
    return <PublishedWikiView data={data} />;
  }

  const authorHandle = formatPublicAuthorHandle(data.owned_by?.display_name);

  return (
    <PublicPageShell>
      <div className="relative mx-auto w-full max-w-[900px]">
        {data.page_type !== "doc" ? (
          <div className="rounded-lg border border-subtle bg-surface-1 p-5 text-14 text-secondary">
            This published page type is not supported in public view yet.
          </div>
        ) : (
          <div
            className={`published-doc-surface ${normalizeDocFontStyle(data.view_props?.font_style)} mx-auto w-full max-w-[680px]`}
          >
            <PublicDocIndex headings={docHeadings} />
            <div className="published-doc-header">
              <p className="tracking-normal text-12 font-medium text-tertiary">
                Written{authorHandle ? ` by ${authorHandle}` : ""}
              </p>
              <h1 className="published-doc-title text-primary">{pageTitle}</h1>
              {data.updated_at && (
                <p className="text-13 text-tertiary">Updated {renderFormattedDate(data.updated_at)}</p>
              )}
            </div>
            <PublicDocContent html={docHtml} embeds={data.embeds ?? []} />
            <PublicDocWikiHoverCard />
          </div>
        )}
      </div>
    </PublicPageShell>
  );
}

export default observer(PublishedPage);
