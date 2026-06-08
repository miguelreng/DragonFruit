/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ArchiveRestoreIcon, FileOutput, FileText, LockKeyhole, LockKeyholeOpen } from "@/components/icons/lucide-shim";
// constants
import { EPageAccess, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// plane editor
import { LinkIcon, CopyIcon, LockIcon, NewTabIcon, ArchiveIcon, TrashIcon, GlobeIcon } from "@plane/propel/icons";
// plane ui
import type { TContextMenuItem } from "@plane/ui";
import { ContextMenu, CustomMenu } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { cn, copyUrlToClipboard } from "@plane/utils";
import { DeletePageModal } from "@/components/pages/modals/delete-page-modal";
import { isBriefPageName } from "@/components/project/brief/constants";
import {
  buildPublicPagePath,
  buildPublicPageUrl,
  getPublicPageSlug,
  normalizePublicPageSlug,
  validatePublicPageSlug,
} from "@/helpers/page-public";
import { DOC_FONT_STYLE_OPTIONS, normalizeDocFontStyle } from "@/helpers/doc-font";
// hooks
import { usePageOperations } from "@/hooks/use-page-operations";
import { useUserPermissions } from "@/hooks/store/user";
// plane web components
import { MovePageModal } from "@/plane-web/components/pages";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { usePageFlag } from "@/plane-web/hooks/use-page-flag";
// services
import { PageTemplateService } from "@/services/page/page-template.service";
// store types
import type { TPageInstance } from "@/store/pages/base-page";

const templateService = new PageTemplateService();

export type TPageActions =
  | "full-screen"
  | "font-style"
  | "focus-mode"
  | "sticky-toolbar"
  | "drop-cap"
  | "copy-markdown"
  | "toggle-lock"
  | "toggle-access"
  | "open-in-new-tab"
  | "copy-link"
  | "copy-public-link"
  | "edit-public-url"
  | "make-a-copy"
  | "archive-restore"
  | "delete"
  | "version-history"
  | "turn-into-task"
  | "export"
  | "save-as-template"
  | "move";

type Props = {
  extraOptions?: (TContextMenuItem & { key: TPageActions })[];
  optionsOrder: TPageActions[];
  page: TPageInstance;
  parentRef?: React.RefObject<HTMLElement>;
  storeType: EPageStoreType;
};

export const PageActions = observer(function PageActions(props: Props) {
  const { extraOptions, optionsOrder, page, parentRef, storeType } = props;
  // states
  const [deletePageModal, setDeletePageModal] = useState(false);
  const [movePageModal, setMovePageModal] = useState(false);
  // params
  const { workspaceSlug } = useParams();
  // permissions — "Save as template" is workspace-admin-only since templates are
  // shared resources visible across every project.
  const { allowPermissions } = useUserPermissions();
  const canSaveAsTemplate = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  // page flag
  const { isMovePageEnabled } = usePageFlag({
    workspaceSlug: workspaceSlug?.toString() ?? "",
  });
  // page operations
  const { pageOperations } = usePageOperations({
    page,
  });

  const handleSaveAsTemplate = useCallback(async () => {
    if (!workspaceSlug || !page.id) return;
    const defaultName = page.name || "Untitled template";
    const name = window.prompt("Save this page as a template — pick a name:", defaultName);
    if (!name) return;
    try {
      await templateService.saveFromPage(workspaceSlug.toString(), page.id, { name: name.trim() });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Template saved",
        message: "It's now available in the Create page modal.",
      });
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't save template",
        message: err?.error || "Try again in a moment.",
      });
    }
  }, [workspaceSlug, page.id, page.name]);
  // derived values
  const {
    access,
    archived_at,
    is_locked,
    view_props,
    canCurrentUserArchivePage,
    canCurrentUserChangeAccess,
    canCurrentUserDeletePage,
    canCurrentUserDuplicatePage,
    canCurrentUserLockPage,
    canCurrentUserMovePage,
  } = page;
  const currentFontStyle = normalizeDocFontStyle(view_props?.font_style);
  const currentFontStyleLabel =
    DOC_FONT_STYLE_OPTIONS.find((option) => option.value === currentFontStyle)?.label ?? "Default";
  const isProjectBrief = page.page_type === "doc" && isBriefPageName(page.name);
  // menu items
  const MENU_ITEMS = useMemo(
    function MENU_ITEMS() {
      const menuItems: (TContextMenuItem & { key: TPageActions })[] = [
        {
          key: "toggle-lock",
          action: () => {
            pageOperations.toggleLock();
          },
          title: is_locked ? "Unlock" : "Lock",
          icon: is_locked ? LockKeyholeOpen : LockKeyhole,
          shouldRender: canCurrentUserLockPage,
        },
        {
          key: "toggle-access",
          action: () => {
            pageOperations.toggleAccess();
          },
          title: access === EPageAccess.PUBLIC ? "Make private" : "Make public",
          icon: access === EPageAccess.PUBLIC ? LockIcon : GlobeIcon,
          shouldRender: canCurrentUserChangeAccess && !archived_at,
        },
        {
          key: "open-in-new-tab",
          action: pageOperations.openInNewTab,
          title: "Open in new tab",
          icon: NewTabIcon,
          shouldRender: true,
        },
        {
          key: "copy-link",
          action: pageOperations.copyLink,
          title: "Copy link",
          icon: LinkIcon,
          shouldRender: true,
        },
        {
          key: "copy-public-link",
          action: async () => {
            if (!workspaceSlug || !page.id) return;
            const slug = getPublicPageSlug(page);
            await copyUrlToClipboard(buildPublicPageUrl(workspaceSlug.toString(), slug));
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: "Public link copied",
              message: "Anyone with this link can view this page.",
            });
          },
          title: "Copy public link",
          icon: GlobeIcon,
          shouldRender: access === EPageAccess.PUBLIC && !archived_at,
        },
        {
          key: "edit-public-url",
          action: async () => {
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
          },
          title: "Edit public URL",
          icon: LinkIcon,
          shouldRender: access === EPageAccess.PUBLIC && canCurrentUserChangeAccess && !archived_at,
        },
        {
          key: "make-a-copy",
          action: () => {
            pageOperations.duplicate();
          },
          title: "Make a copy",
          icon: CopyIcon,
          shouldRender: canCurrentUserDuplicatePage,
        },
        {
          key: "archive-restore",
          action: () => {
            pageOperations.toggleArchive();
          },
          title: archived_at ? "Restore" : "Archive",
          icon: archived_at ? ArchiveRestoreIcon : ArchiveIcon,
          shouldRender: canCurrentUserArchivePage && (!isProjectBrief || !!archived_at),
        },
        {
          key: "delete",
          action: () => {
            setDeletePageModal(true);
          },
          title: "Delete",
          icon: TrashIcon,
          shouldRender: canCurrentUserDeletePage && !!archived_at && !isProjectBrief,
        },
        {
          key: "move",
          action: () => setMovePageModal(true),
          title: "Move",
          icon: FileOutput,
          shouldRender: canCurrentUserMovePage && isMovePageEnabled && !isProjectBrief,
        },
        {
          key: "save-as-template",
          action: () => {
            void handleSaveAsTemplate();
          },
          title: "Save as template",
          icon: FileText,
          shouldRender: canSaveAsTemplate && !archived_at,
        },
      ];
      if (extraOptions) {
        menuItems.push(...extraOptions);
      }
      return menuItems;
    },
    [
      extraOptions,
      is_locked,
      canCurrentUserLockPage,
      access,
      canCurrentUserChangeAccess,
      archived_at,
      canCurrentUserDuplicatePage,
      canCurrentUserArchivePage,
      canCurrentUserDeletePage,
      canCurrentUserMovePage,
      canSaveAsTemplate,
      isProjectBrief,
      isMovePageEnabled,
      pageOperations,
      page,
      workspaceSlug,
      handleSaveAsTemplate,
    ]
  );
  // arrange options
  const arrangedOptions = useMemo<(TContextMenuItem & { key: TPageActions })[]>(
    () =>
      optionsOrder
        .map((key) => MENU_ITEMS.find((item) => item.key === key))
        .filter((item): item is TContextMenuItem & { key: TPageActions } => !!item),
    [optionsOrder, MENU_ITEMS]
  );

  const renderMenuItemContent = (item: TContextMenuItem) => {
    if (item.key === "font-style") {
      return (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate">Font</span>
          <span className="truncate text-tertiary">{currentFontStyleLabel}</span>
        </div>
      );
    }

    return (
      item.customContent ?? (
        <>
          {item.icon && <item.icon className="size-3" />}
          {item.title}
        </>
      )
    );
  };

  return (
    <>
      <MovePageModal isOpen={movePageModal} onClose={() => setMovePageModal(false)} page={page} />
      <DeletePageModal
        isOpen={deletePageModal}
        onClose={() => setDeletePageModal(false)}
        page={page}
        storeType={storeType}
      />
      {parentRef && <ContextMenu parentRef={parentRef} items={arrangedOptions} />}
      <CustomMenu placement="bottom-end" optionsClassName="max-h-[90vh]" ellipsis closeOnSelect={false}>
        {arrangedOptions.map((item) => {
          if (item.shouldRender === false) return null;

          if (item.nestedMenuItems?.length) {
            return (
              <CustomMenu.SubMenu
                key={item.key}
                trigger={renderMenuItemContent(item)}
                disabled={item.disabled}
                className={item.className}
              >
                <CustomMenu.SubMenuContent className="min-w-[14rem]">
                  {item.nestedMenuItems
                    .filter((nestedItem) => nestedItem.shouldRender !== false)
                    .map((nestedItem) => (
                      <CustomMenu.MenuItem
                        key={nestedItem.key}
                        onClick={() => {
                          nestedItem.action?.();
                        }}
                        className={cn("flex items-center gap-2", nestedItem.className)}
                        disabled={nestedItem.disabled}
                      >
                        {nestedItem.customContent ?? (
                          <>
                            {nestedItem.icon && <nestedItem.icon className="size-3" />}
                            {nestedItem.title}
                          </>
                        )}
                      </CustomMenu.MenuItem>
                    ))}
                </CustomMenu.SubMenuContent>
              </CustomMenu.SubMenu>
            );
          }

          return (
            <CustomMenu.MenuItem
              key={item.key}
              onClick={() => {
                item.action?.();
              }}
              className={cn("flex items-center gap-2", item.className)}
              disabled={item.disabled}
            >
              {renderMenuItemContent(item)}
            </CustomMenu.MenuItem>
          );
        })}
      </CustomMenu>
    </>
  );
});
