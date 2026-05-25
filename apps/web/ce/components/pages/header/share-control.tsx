/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Check, Copy, Globe, Loader2, LockKeyhole, Pencil } from "@/components/icons/lucide-shim";
import { EPageAccess } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { copyTextToClipboard } from "@plane/utils";
import {
  buildPublicPagePath,
  buildPublicPageUrl,
  getPublicPageSlug,
  normalizePublicPageSlug,
  validatePublicPageSlug,
} from "@/helpers/page-public";
import type { EPageStoreType } from "@/plane-web/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";

export type TPageShareControlProps = {
  page: TPageInstance;
  storeType: EPageStoreType;
};

export const PageShareControl = observer(function PageShareControl({ page }: TPageShareControlProps) {
  const { workspaceSlug } = useParams();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publicUrl = useMemo(() => {
    if (!workspaceSlug || !page.id) return "";
    return buildPublicPageUrl(workspaceSlug.toString(), getPublicPageSlug(page));
  }, [page, workspaceSlug]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const showPanel = useCallback((copied = false) => {
    setShowPublishPanel(true);
    setIsCopied(copied);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsCopied(false);
      timerRef.current = null;
    }, 1400);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!publicUrl) return;
    await copyTextToClipboard(publicUrl);
    showPanel(true);
  }, [publicUrl, showPanel]);

  const handleEditPublicUrl = useCallback(async () => {
    if (!workspaceSlug || !page.id) return;
    const currentSlug = getPublicPageSlug(page);
    const input = window.prompt("Public URL slug", currentSlug);
    if (input === null) return;

    const nextSlug = normalizePublicPageSlug(input);
    const validationError = validatePublicPageSlug(nextSlug);
    if (validationError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Invalid slug",
        message: validationError,
      });
      return;
    }

    await page.updateViewProps({ public_slug: nextSlug });
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Public URL updated",
      message: buildPublicPagePath(workspaceSlug.toString(), nextSlug),
    });
    setShowPublishPanel(true);
  }, [page, workspaceSlug]);

  const handleMakePrivate = useCallback(async () => {
    setIsUpdatingPrivacy(true);
    try {
      await page.makePrivate({});
      setShowPublishPanel(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Doc is private",
        message: "The public link is no longer available.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't make doc private",
        message: "Try again in a moment.",
      });
    } finally {
      setIsUpdatingPrivacy(false);
    }
  }, [page]);

  const handlePublish = useCallback(async () => {
    if (page.access === EPageAccess.PUBLIC) {
      setShowPublishPanel((current) => !current);
      return;
    }

    setIsPublishing(true);
    try {
      await page.makePublic({});
      showPanel(false);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't publish doc",
        message: "Try again in a moment.",
      });
    } finally {
      setIsPublishing(false);
    }
  }, [page, showPanel]);

  if (page.archived_at || !page.canCurrentUserChangeAccess) return null;

  return (
    <div className="relative">
      {showPublishPanel && publicUrl && (
        <div className="shadow-lg absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-subtle-1 bg-surface-1 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-11 font-medium text-secondary">
            {isCopied ? <Check className="size-3.5 text-success-primary" /> : <Globe className="size-3.5" />}
            {isCopied ? "Copied public URL" : "Published URL"}
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-sm border border-subtle-1 bg-layer-1 px-2 py-1.5 text-12 text-secondary">
              {publicUrl}
            </div>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex size-8 flex-shrink-0 items-center justify-center rounded-sm border border-subtle-1 bg-surface-2 text-secondary hover:bg-layer-2"
              aria-label="Copy published URL"
            >
              {isCopied ? <Check className="size-3.5 text-success-primary" /> : <Copy className="size-3.5" />}
            </button>
          </div>
          {page.access === EPageAccess.PUBLIC && (
            <div className="mt-2 border-t border-subtle-1 pt-1">
              <button
                type="button"
                onClick={() => void handleEditPublicUrl()}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-12 text-secondary hover:bg-layer-2"
              >
                <Pencil className="size-3.5" />
                Edit public URL
              </button>
              <button
                type="button"
                onClick={() => void handleMakePrivate()}
                disabled={isUpdatingPrivacy}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-12 text-secondary hover:bg-layer-2 disabled:cursor-wait disabled:opacity-70"
              >
                {isUpdatingPrivacy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <LockKeyhole className="size-3.5" />
                )}
                Make private
              </button>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => void handlePublish()}
        disabled={isPublishing}
        className="flex h-7 items-center gap-1.5 rounded-md border border-subtle-1 bg-surface-1 px-2.5 text-12 font-medium text-secondary transition-colors hover:bg-layer-2 disabled:cursor-wait disabled:opacity-70"
      >
        {isPublishing ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
        {page.access === EPageAccess.PUBLIC ? "Published" : "Publish"}
      </button>
    </div>
  );
});
