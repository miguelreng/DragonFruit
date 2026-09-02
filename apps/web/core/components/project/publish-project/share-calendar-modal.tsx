/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { Button } from "@dragonfruit/propel/button";
import { TOAST_TYPE, setToast } from "@dragonfruit/propel/toast";
import type { TProjectPublishViewProps } from "@dragonfruit/types";
import { EModalWidth, Loader, ModalCore } from "@dragonfruit/ui";
import { copyTextToClipboard } from "@dragonfruit/utils";
import { CheckIcon, GlobeIcon, NewTabIcon } from "@/components/icons/propel-shim";
import { useProjectPublish } from "@/hooks/store/use-project-publish";
import { buildPublishedProjectCalendarUrl } from "./public-link";

type TShareProjectCalendarModalProps = {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
};

const enabledPublicViews = (viewProps: TProjectPublishViewProps | undefined) =>
  Object.entries(viewProps ?? {})
    .filter(([, isEnabled]) => isEnabled)
    .map(([view]) => view);

export const ShareProjectCalendarModal = observer(function ShareProjectCalendarModal(
  props: TShareProjectCalendarModalProps
) {
  const { isOpen, projectId, onClose } = props;
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [isSharing, setIsSharing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const {
    fetchPublishSettings,
    getPublishSettingsByProjectID,
    publishProject,
    updatePublishSettings,
    unPublishProject,
    fetchSettingsLoader,
  } = useProjectPublish();

  const publishSettings = getPublishSettingsByProjectID(projectId);
  const isProjectPublished = Boolean(publishSettings?.anchor);
  const isCalendarShared = Boolean(publishSettings?.anchor && publishSettings.view_props?.calendar);
  const publicCalendarUrl = useMemo(() => {
    if (!workspaceSlug || !publishSettings?.anchor) return "";
    const currentOrigin = typeof window === "undefined" ? "" : window.location.origin;
    return buildPublishedProjectCalendarUrl(workspaceSlug, publishSettings.anchor, { currentOrigin });
  }, [publishSettings?.anchor, workspaceSlug]);

  useEffect(() => {
    if (!isOpen || !workspaceSlug || publishSettings) return;
    void fetchPublishSettings(workspaceSlug, projectId);
  }, [fetchPublishSettings, isOpen, projectId, publishSettings, workspaceSlug]);

  const handleShare = async () => {
    if (!workspaceSlug) return;
    setIsSharing(true);
    try {
      if (isProjectPublished && publishSettings?.id) {
        await updatePublishSettings(workspaceSlug, projectId, publishSettings.id, {
          view_props: { ...publishSettings.view_props, calendar: true },
        });
      } else {
        await publishProject(workspaceSlug, projectId, {
          is_comments_enabled: false,
          is_reactions_enabled: false,
          is_votes_enabled: false,
          view_props: { calendar: true },
        });
      }
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Calendar is public",
        message: "Anyone with the link can now view this project calendar.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn’t share calendar",
        message: "Please try again in a moment.",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleStopSharing = async () => {
    if (!workspaceSlug || !publishSettings?.id) return;
    setIsStopping(true);
    try {
      const otherPublicViews = enabledPublicViews(publishSettings.view_props).filter((view) => view !== "calendar");
      if (otherPublicViews.length > 0) {
        await updatePublishSettings(workspaceSlug, projectId, publishSettings.id, {
          view_props: { ...publishSettings.view_props, calendar: false },
        });
      } else {
        await unPublishProject(workspaceSlug, projectId, publishSettings.id);
      }
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Calendar sharing stopped",
        message: "The public calendar link is no longer available.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn’t stop sharing",
        message: "Please try again in a moment.",
      });
    } finally {
      setIsStopping(false);
    }
  };

  const handleCopyLink = async () => {
    if (!publicCalendarUrl) return;
    await copyTextToClipboard(publicCalendarUrl);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "",
      message: "Public calendar link copied.",
    });
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} width={EModalWidth.XL}>
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <h5 className="text-18 font-medium text-primary">Share calendar</h5>
          <p className="mt-1 text-13 text-tertiary">Publish a read-only calendar for anyone with the link.</p>
        </div>
        {isCalendarShared && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 text-12 font-medium text-success-primary">
            <CheckIcon className="size-3.5" />
            Public
          </span>
        )}
      </div>

      {fetchSettingsLoader ? (
        <Loader className="space-y-3 px-5 pb-5">
          <Loader.Item height="72px" />
          <Loader.Item height="40px" />
        </Loader>
      ) : (
        <div className="space-y-4 px-5 pb-5">
          <div className="flex gap-3 rounded-xl border border-subtle bg-layer-1 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-1 text-accent-primary shadow-raised-100">
              <GlobeIcon className="size-4" />
            </span>
            <div>
              <p className="text-13 font-medium text-primary">Anyone with the link can view</p>
              <p className="mt-1 text-12 leading-5 text-tertiary">
                Visitors can browse dated tasks and open their public details. They cannot create or edit tasks.
              </p>
            </div>
          </div>

          {isCalendarShared && publicCalendarUrl && (
            <div className="flex items-center gap-2 rounded-lg border border-strong py-1.5 pr-1.5 pl-3">
              <span className="min-w-0 flex-1 truncate text-12 text-secondary">{publicCalendarUrl}</span>
              <a
                href={publicCalendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open public calendar in a new tab"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-layer-3 text-secondary hover:bg-layer-3-hover"
              >
                <NewTabIcon className="size-4" />
              </a>
              <Button variant="secondary" size="lg" onClick={handleCopyLink}>
                Copy link
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-4">
        <div>
          {isCalendarShared && !fetchSettingsLoader && (
            <Button variant="error-fill" size="lg" loading={isStopping} onClick={handleStopSharing}>
              {isStopping ? "Stopping…" : "Stop sharing"}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {isCalendarShared ? "Done" : "Cancel"}
          </Button>
          {!fetchSettingsLoader && !isCalendarShared && (
            <Button variant="primary" size="lg" loading={isSharing} onClick={handleShare}>
              {isSharing ? "Publishing…" : "Share calendar"}
            </Button>
          )}
        </div>
      </div>
    </ModalCore>
  );
});
