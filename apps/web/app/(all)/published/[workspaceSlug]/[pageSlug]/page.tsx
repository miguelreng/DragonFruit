/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR from "swr";
import { Loader2 } from "@/components/icons/lucide-shim";
import { PublicPageService } from "@/services/page/public-page.service";
import dragonMark from "@/app/assets/branding/dragon.svg?url";
import { renderFormattedDate } from "@plane/utils";
import { PublicDocContent } from "@/components/pages/published/public-doc-content";
import type { Route } from "./+types/page";

const publicPageService = new PublicPageService();

function PublishedPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, pageSlug } = params;

  const { data, error, isLoading } = useSWR(
    workspaceSlug && pageSlug ? `PUBLIC_PAGE_${workspaceSlug}_${pageSlug}` : null,
    () => publicPageService.retrieve(workspaceSlug, pageSlug),
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <div className="bg-custom-background-100 grid min-h-screen place-items-center">
        <div className="flex items-center gap-2 text-13 text-tertiary">
          <Loader2 className="size-4 animate-spin" />
          <span>Loading published page</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-custom-background-100 grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-22 font-semibold text-primary">Page not found</h1>
          <p className="mt-2 text-14 leading-6 text-secondary">
            This published page doesn&apos;t exist, is private, or was removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-custom-background-100 min-h-screen text-primary">
      <header className="bg-custom-background-100/85 sticky top-0 z-10 border-b border-subtle/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1040px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link to="/" className="flex items-center gap-2 text-13 font-medium text-secondary hover:text-primary">
            <img src={dragonMark} alt="" className="size-5 opacity-80" aria-hidden />
            <span>DragonFruit</span>
          </Link>
          {data.project_id && (
            <Link
              to={`/${workspaceSlug}/projects/${data.project_id}/pages/${data.id}`}
              className="rounded-sm border border-subtle bg-surface-1 px-2.5 py-1.5 text-12 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
            >
              Open in app
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1040px] px-5 py-10 sm:px-8 sm:py-14">
        {data.page_type !== "doc" ? (
          <div className="mx-auto max-w-[680px] rounded-md border border-subtle bg-surface-1 p-5 text-14 text-secondary">
            This published page type is not supported in public view yet.
          </div>
        ) : (
          <div className="mx-auto max-w-[680px]">
            <div className="mb-10">
              <p className="tracking-normal text-12 font-medium text-tertiary">Published document</p>
              <h1 className="published-doc-title mt-2 text-primary">{data.name || "Untitled"}</h1>
              {data.updated_at && (
                <p className="mt-3 text-13 text-tertiary">Updated {renderFormattedDate(data.updated_at)}</p>
              )}
            </div>
            <PublicDocContent html={data.description_html || "<p></p>"} embeds={data.embeds ?? []} />
          </div>
        )}
      </main>
    </div>
  );
}

export default observer(PublishedPage);
