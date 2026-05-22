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
      <div className="grid min-h-screen place-items-center bg-custom-background-100">
        <Loader2 className="size-6 animate-spin text-tertiary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-custom-background-100 px-4">
        <div className="w-full max-w-xl rounded-lg border border-subtle bg-surface-1 p-6 text-center">
          <h1 className="text-22 font-semibold text-primary">Page not found</h1>
          <p className="mt-2 text-14 text-secondary">
            This published page doesn&apos;t exist, is private, or was removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-custom-background-100">
      <header className="border-b border-subtle bg-surface-1/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-16 font-semibold text-primary">{data.name || "Untitled"}</h1>
            <p className="text-12 text-tertiary">Published from DragonFruit</p>
          </div>
          {data.project_id && (
            <Link
              to={`/${workspaceSlug}/projects/${data.project_id}/pages/${data.id}`}
              className="rounded-sm border border-subtle px-2 py-1 text-12 text-secondary hover:bg-layer-1 hover:text-primary"
            >
              Open in app
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        {data.page_type !== "doc" ? (
          <div className="rounded-lg border border-subtle bg-surface-1 p-5 text-14 text-secondary">
            This published page type is not supported in public view yet.
          </div>
        ) : (
          <article
            className="prose prose-neutral dark:prose-invert max-w-none rounded-lg border border-subtle bg-surface-1 p-5 sm:p-8"
            dangerouslySetInnerHTML={{ __html: data.description_html || "<p></p>" }}
          />
        )}
      </main>
    </div>
  );
}

export default observer(PublishedPage);
