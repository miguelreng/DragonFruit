/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
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
            {isCopied ? (
              <HeroCheckCircleIcon className="size-4 text-success-primary" />
            ) : (
              <HeroGlobeAltIcon className="size-4" />
            )}
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
              {isCopied ? (
                <HeroCheckCircleIcon className="size-4 text-success-primary" />
              ) : (
                <HeroClipboardDocumentIcon className="size-4" />
              )}
            </button>
          </div>
          {page.access === EPageAccess.PUBLIC && (
            <div className="mt-2 border-t border-subtle-1 pt-1">
              <button
                type="button"
                onClick={() => void handleEditPublicUrl()}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-12 text-secondary hover:bg-layer-2"
              >
                <HeroPencilSquareIcon className="size-4" />
                Edit public URL
              </button>
              <button
                type="button"
                onClick={() => void handleMakePrivate()}
                disabled={isUpdatingPrivacy}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-12 text-secondary hover:bg-layer-2 disabled:cursor-wait disabled:opacity-70"
              >
                {isUpdatingPrivacy ? (
                  <HeroArrowPathIcon className="size-4 animate-spin" />
                ) : (
                  <HeroLockClosedIcon className="size-4" />
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
        {isPublishing ? <HeroArrowPathIcon className="size-4 animate-spin" /> : <HeroGlobeAltIcon className="size-4" />}
        {page.access === EPageAccess.PUBLIC ? "Published" : "Publish"}
      </button>
    </div>
  );
});

type THeroIconProps = {
  className?: string;
};

function HeroGlobeAltIcon({ className }: THeroIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9 9 0 1 0 0-18m0 18a9 9 0 1 1 0-18m0 18c2.071 0 3.75-4.03 3.75-9S14.071 3 12 3m0 18c-2.071 0-3.75-4.03-3.75-9S9.929 3 12 3m-8.4 6h16.8M3.6 15h16.8"
      />
    </svg>
  );
}

function HeroClipboardDocumentIcon({ className }: THeroIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75A1.125 1.125 0 0 1 3.75 20.625V7.875c0-.621.504-1.125 1.125-1.125H6.75m6-4.5H9.375c-.621 0-1.125.504-1.125 1.125v13.5c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V7.125L15.375 2.25H12.75Zm0 0v4.5h4.5"
      />
    </svg>
  );
}

function HeroCheckCircleIcon({ className }: THeroIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function HeroPencilSquareIcon({ className }: THeroIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  );
}

function HeroLockClosedIcon({ className }: THeroIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5A2.25 2.25 0 0 0 19.5 19.5v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
      />
    </svg>
  );
}

function HeroArrowPathIcon({ className }: THeroIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}
