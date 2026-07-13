/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Popover, Transition } from "@headlessui/react";
import { Fragment, useState } from "react";
import { usePopper } from "react-popper";
import { EPageAccess } from "@plane/constants";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage } from "@plane/types";
import { cn, copyUrlToClipboard, getPageName } from "@plane/utils";
import { Copy, ExternalLink, Settings } from "@/components/icons/lucide-shim";
import { GlobeIcon } from "@/components/icons/propel-shim";
import { buildPublicPagePath, buildPublicPageUrl, getPublicPageSlug } from "@/helpers/page-public";
import { ProjectPageService } from "@/services/page/project-page.service";

const pageService = new ProjectPageService();

type Props = {
  workspaceSlug: string;
  folder: TPage;
  /** Open the full Wiki settings / Create wiki modal for this folder. */
  onOpenSettings: () => void;
  /** Refresh the pages list after publish state changes. */
  onChanged: () => Promise<void> | void;
};

/**
 * One surface for a wiki's share state, opened from the folder header:
 * live status, the public link, view/copy, settings, and unpublish — so the
 * lifecycle never hides inside a context menu.
 */
export function WikiSharePopover({ workspaceSlug, folder, onOpenSettings, onChanged }: Props) {
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const { styles, attributes } = usePopper(referenceElement, popperElement, { placement: "bottom-end" });

  const isPublished = folder.access === EPageAccess.PUBLIC;
  const publicSlug = getPublicPageSlug(folder);
  const publicPath = buildPublicPagePath(workspaceSlug, publicSlug);

  const copyLink = () => {
    void copyUrlToClipboard(buildPublicPageUrl(workspaceSlug, publicSlug)).then(() =>
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Wiki link copied" })
    );
  };

  const unpublish = async (close: () => void) => {
    const projectId = folder.project_ids?.[0];
    if (!folder.id || !projectId || isUnpublishing) return;
    setIsUnpublishing(true);
    try {
      await pageService.updateAccess(workspaceSlug, projectId, folder.id, { access: EPageAccess.PRIVATE });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Wiki unpublished",
        message: "The public link is offline. Only workspace members can preview it.",
      });
      await onChanged();
      close();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "The wiki could not be unpublished." });
    } finally {
      setIsUnpublishing(false);
    }
  };

  return (
    <Popover as="div" className="relative">
      <Popover.Button
        ref={setReferenceElement}
        className={cn(getButtonStyling("secondary", "lg"), "relative")}
        title={isPublished ? "This folder is a published wiki" : "Share this folder as a wiki"}
      >
        <GlobeIcon className="size-4" />
        {isPublished ? "Wiki" : "Share"}
        {isPublished && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-success-primary" />}
      </Popover.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="opacity-0 translate-y-0.5"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-75"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <Popover.Panel
          ref={setPopperElement}
          style={styles.popper}
          {...attributes.popper}
          className="z-20 w-80 rounded-xl border border-subtle bg-surface-1 p-3 shadow-raised-200"
        >
          {({ close }) => (
            <div className="flex flex-col gap-3">
              {isPublished ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full bg-success-primary" />
                    <p className="text-13 font-medium text-primary">This wiki is live</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-subtle bg-layer-1 px-2">
                      <span className="truncate text-12 text-secondary">{publicPath}</span>
                    </div>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-subtle text-tertiary hover:bg-layer-1 hover:text-primary"
                      aria-label="Copy wiki link"
                      title="Copy wiki link"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={publicPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(getButtonStyling("primary", "lg"), "flex-1 justify-center")}
                    >
                      View wiki
                      <ExternalLink className="size-3.5" />
                    </a>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="flex-1 justify-center"
                      onClick={() => {
                        close();
                        onOpenSettings();
                      }}
                    >
                      <Settings className="size-3.5" />
                      Settings
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void unpublish(close)}
                    disabled={isUnpublishing}
                    className="self-start text-11 font-medium text-tertiary hover:text-red-500 disabled:opacity-60"
                  >
                    {isUnpublishing ? "Unpublishing..." : "Unpublish wiki"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-13 font-medium text-primary">Not published yet</p>
                  <p className="-mt-2 text-12 text-tertiary">
                    Only workspace members can see the docs in {getPageName(folder.name)}. Publish it as a wiki to
                    share a read-only link.
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="primary"
                      size="lg"
                      className="flex-1 justify-center"
                      onClick={() => {
                        close();
                        onOpenSettings();
                      }}
                    >
                      Create wiki
                    </Button>
                    <a
                      href={publicPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Preview how the wiki will look — only visible to workspace members"
                      className={cn(getButtonStyling("secondary", "lg"), "flex-1 justify-center")}
                    >
                      Preview
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </>
              )}
            </div>
          )}
        </Popover.Panel>
      </Transition>
    </Popover>
  );
}
