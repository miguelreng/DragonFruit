/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef } from "react";
import { observer } from "mobx-react";
// plane imports
import type { EditorRefApi } from "@dragonfruit/editor";
import { useTranslation } from "@dragonfruit/i18n";
import { Button } from "@dragonfruit/propel/button";
import { IconButton } from "@dragonfruit/propel/icon-button";
import { CopyIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons/propel-shim";
import { setToast, TOAST_TYPE } from "@dragonfruit/propel/toast";
import { Tooltip } from "@dragonfruit/propel/tooltip";
import type { TDescriptionVersion } from "@dragonfruit/types";
import { Avatar, EModalPosition, EModalWidth, Loader, ModalCore } from "@dragonfruit/ui";
import { calculateTimeAgo, cn, getFileURL } from "@dragonfruit/utils";
// components
import { RichTextEditor } from "@/components/editor/rich-text";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";

type Props = {
  activeVersionDescription: string | undefined;
  activeVersionDetails: TDescriptionVersion | undefined;
  handleClose: () => void;
  handleNavigation: (direction: "prev" | "next") => void;
  handleRestore: (descriptionHTML: string) => void;
  isNextDisabled: boolean;
  isOpen: boolean;
  isPrevDisabled: boolean;
  isRestoreDisabled: boolean;
  projectId: string | undefined;
  workspaceSlug: string;
};

export const DescriptionVersionsModal = observer(function DescriptionVersionsModal(props: Props) {
  const {
    activeVersionDescription,
    activeVersionDetails,
    handleClose,
    handleNavigation,
    handleRestore,
    isNextDisabled,
    isPrevDisabled,
    isOpen,
    isRestoreDisabled,
    projectId,
    workspaceSlug,
  } = props;
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  // store hooks
  const { getUserDetails } = useMember();
  const { getWorkspaceBySlug } = useWorkspace();
  // derived values
  const activeVersionId = activeVersionDetails?.id;
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id;
  const versionCreator = activeVersionDetails?.owned_by ? getUserDetails(activeVersionDetails.owned_by) : null;
  // translation
  const { t } = useTranslation();

  const handleCopyMarkdown = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.copyMarkdownToClipboard();
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: t("toast.success"),
      message: "Markdown copied to clipboard.",
    });
  }, [t]);

  if (!workspaceId) return null;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXXL}>
      <div className="p-4" data-prevent-outside-click>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 py-0.5">
          <div className="flex flex-shrink-0 items-center gap-2 text-13">
            <p className="flex items-center gap-1">
              {t("description_versions.edited_by")}
              <span className="flex-shrink-0">
                <Avatar
                  size="sm"
                  src={getFileURL(versionCreator?.avatar_url ?? "")}
                  name={versionCreator?.display_name}
                />
              </span>
            </p>
            <p className="flex-shrink-0 text-secondary">
              {calculateTimeAgo(activeVersionDetails?.last_saved_at ?? "")}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center">
            <IconButton
              variant="ghost"
              size="base"
              icon={ChevronLeftIcon}
              aria-label="Previous version"
              onClick={() => handleNavigation("prev")}
              disabled={isPrevDisabled}
            />
            <IconButton
              variant="ghost"
              size="base"
              icon={ChevronRightIcon}
              aria-label="Next version"
              onClick={() => handleNavigation("next")}
              disabled={isNextDisabled}
            />
          </div>
        </div>
        {/* End header */}
        {/* Version description */}
        <div className="mt-4 pb-4">
          {activeVersionId && activeVersionDescription ? (
            <RichTextEditor
              key={activeVersionId}
              editable={false}
              containerClassName="p-0 !pl-0 border-none"
              editorClassName="pl-0"
              id={activeVersionId}
              initialValue={activeVersionDescription}
              projectId={projectId}
              ref={editorRef}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            />
          ) : (
            <div className="space-y-1">
              <Loader.Item width="300px" height="15px" />
              <Loader.Item width="400px" height="15px" />
              <div className="flex items-center gap-2">
                <Loader.Item width="20px" height="15px" />
                <Loader.Item width="500px" height="15px" />
              </div>
              <div className="flex items-center gap-2">
                <Loader.Item width="20px" height="15px" />
                <Loader.Item width="200px" height="15px" />
              </div>
              <Loader.Item width="300px" height="15px" />
              <Loader.Item width="200px" height="15px" />
            </div>
          )}
        </div>
        {/* End version description */}
        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t-[0.5px] border-subtle pt-4">
          <Tooltip tooltipContent={t("common.actions.copy_markdown")}>
            <IconButton type="button" variant="ghost" size="base" onClick={handleCopyMarkdown} icon={CopyIcon} aria-label="Copy as Markdown" />
          </Tooltip>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={handleClose} tabIndex={1}>
              {t("common.cancel")}
            </Button>
            {!isRestoreDisabled && (
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  handleRestore(activeVersionDescription ?? "<p></p>");
                  handleClose();
                }}
              >
                {t("common.actions.restore")}
              </Button>
            )}
          </div>
        </div>
        {/* End footer */}
      </div>
    </ModalCore>
  );
});
