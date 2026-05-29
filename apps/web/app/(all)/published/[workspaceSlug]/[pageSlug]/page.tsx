/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useMemo, type ReactNode } from "react";
import useSWR from "swr";
import { PublicPageService } from "@/services/page/public-page.service";
import dragonFruitLogo from "@/app/assets/plane-logos/logo-black.svg?url";
import { renderFormattedDate } from "@plane/utils";
import {
  addPublicDocHeadingIds,
  getPublicDocHeadings,
  PublicDocContent,
  PublicDocIndex,
} from "@/components/pages/published/public-doc-content";
import { normalizeDocFontStyle } from "@/helpers/doc-font";
import type { Route } from "./+types/page";

const publicPageService = new PublicPageService();

const PublicPageShell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-full bg-white text-primary">
    <div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col px-5 sm:px-8">
      <main className="flex-1 py-10 sm:py-14">{children}</main>
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

  const { data, error, isLoading } = useSWR(
    workspaceSlug && pageSlug ? `PUBLIC_PAGE_${workspaceSlug}_${pageSlug}` : null,
    () => publicPageService.retrieve(workspaceSlug, pageSlug),
    { revalidateOnFocus: false }
  );
  const docHtml = useMemo(() => addPublicDocHeadingIds(data?.description_html || "<p></p>"), [data?.description_html]);
  const docHeadings = useMemo(() => getPublicDocHeadings(docHtml), [docHtml]);

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

  const authorHandle = formatPublicAuthorHandle(data.owned_by?.display_name);

  return (
    <PublicPageShell>
      <div className="relative mx-auto w-full max-w-[900px]">
        {data.page_type !== "doc" ? (
          <div className="rounded-lg border border-subtle bg-surface-1 p-5 text-14 text-secondary">
            This published page type is not supported in public view yet.
          </div>
        ) : (
          <div className={`published-doc-surface ${normalizeDocFontStyle(data.view_props?.font_style)} mx-auto w-full max-w-[680px]`}>
            <PublicDocIndex headings={docHeadings} />
            <div className="mb-10">
              <p className="tracking-normal text-12 font-medium text-tertiary">
                Written{authorHandle ? ` by ${authorHandle}` : ""}
              </p>
              <h1 className="published-doc-title mt-2 text-primary">{data.name || "Untitled"}</h1>
              {data.updated_at && (
                <p className="mt-3 text-13 text-tertiary">Updated {renderFormattedDate(data.updated_at)}</p>
              )}
            </div>
            <PublicDocContent html={docHtml} embeds={data.embeds ?? []} />
          </div>
        )}
      </div>
    </PublicPageShell>
  );
}

export default observer(PublishedPage);
