/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Image, Star, X } from "@/components/icons/lucide-shim";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useBookmark } from "@/hooks/store/use-bookmark";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";

type TImageContextMenu = {
  imageUrl: string;
  imageAlt: string;
  pageUrl: string;
  pageTitle: string;
  x: number;
  y: number;
};

const paramToString = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const normalizeImageUrl = (src: string) => {
  try {
    const url = new URL(src, window.location.href);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
};

const imageTitle = (imageUrl: string, imageAlt: string) => {
  if (imageAlt.trim()) return imageAlt.trim();
  try {
    const pathParts = new URL(imageUrl).pathname.split("/").toReversed();
    const fileName = pathParts.find((part) => part.length > 0);
    return fileName ? decodeURIComponent(fileName).replace(/[-_]+/g, " ") : "Saved image";
  } catch {
    return "Saved image";
  }
};

export const ImageSaveToWorkspaceProvider = observer(function ImageSaveToWorkspaceProvider() {
  const params = useParams();
  const workspaceSlug = paramToString(params.workspaceSlug);
  const routeProjectId = paramToString(params.projectId);
  const bookmarkStore = useBookmark();
  const { joinedProjectIds, getPartialProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const [menu, setMenu] = useState<TImageContextMenu | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const writableProjectIds = useMemo(
    () =>
      joinedProjectIds.filter((projectId) =>
        allowPermissions(
          [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
          EUserPermissionsLevel.PROJECT,
          workspaceSlug,
          projectId
        )
      ),
    [allowPermissions, joinedProjectIds, workspaceSlug]
  );

  useEffect(() => {
    if (!menu) return;
    if (selectedProjectId && writableProjectIds.includes(selectedProjectId)) return;
    const defaultProjectId =
      routeProjectId && writableProjectIds.includes(routeProjectId) ? routeProjectId : (writableProjectIds[0] ?? "");
    setSelectedProjectId(defaultProjectId);
  }, [menu, routeProjectId, selectedProjectId, writableProjectIds]);

  useEffect(() => {
    const closeMenu = () => setMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const image = target.closest("img");
      if (!(image instanceof HTMLImageElement)) return;

      const imageUrl = normalizeImageUrl(image.currentSrc || image.src);
      if (!imageUrl) return;

      event.preventDefault();
      event.stopPropagation();
      setSelectedProjectId(
        routeProjectId && writableProjectIds.includes(routeProjectId) ? routeProjectId : (writableProjectIds[0] ?? "")
      );
      setMenu({
        imageUrl,
        imageAlt: image.alt,
        pageUrl: window.location.href,
        pageTitle: document.title,
        x: Math.min(event.clientX, window.innerWidth - 280),
        y: Math.min(event.clientY, window.innerHeight - 220),
      });
    };

    document.addEventListener("contextmenu", handleContextMenu, true);
    return () => document.removeEventListener("contextmenu", handleContextMenu, true);
  }, [routeProjectId, writableProjectIds]);

  const handleSave = async () => {
    if (!workspaceSlug || !menu || !selectedProjectId || isSaving) return;

    setIsSaving(true);
    try {
      const title = imageTitle(menu.imageUrl, menu.imageAlt);
      await bookmarkStore.createBookmark(workspaceSlug, selectedProjectId, {
        title,
        url: menu.imageUrl,
        description: menu.pageTitle ? `Saved from ${menu.pageTitle}` : "",
        tags: ["image"],
        metadata: {
          image_url: menu.imageUrl,
          source_app: "DragonFruit Web",
          site_name: "Image",
          captured_text: menu.pageUrl,
          source_url: menu.pageUrl,
        },
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Image saved to workspace" });
      setMenu(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Image could not be saved" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!menu) return null;

  const hasWritableProject = writableProjectIds.length > 0;

  return createPortal(
    <div
      role="menu"
      className="fixed z-[9999] w-72 rounded-lg border border-subtle bg-surface-1 p-2 text-primary shadow-raised-200"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start gap-2 rounded-md bg-layer-1 p-2">
        <div className="grid size-10 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-surface-1">
          <img src={menu.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-13 font-medium text-primary">{imageTitle(menu.imageUrl, menu.imageAlt)}</p>
          <p className="mt-0.5 line-clamp-2 text-11 text-tertiary">{menu.pageTitle || menu.pageUrl}</p>
        </div>
        <button
          type="button"
          aria-label="Close image bookmark menu"
          className="grid size-6 flex-shrink-0 place-items-center rounded text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
          onClick={() => setMenu(null)}
        >
          <X className="size-3.5" />
        </button>
      </div>
      {writableProjectIds.length > 1 && (
        <label className="mt-2 block">
          <span className="sr-only">Project</span>
          <select
            className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            {writableProjectIds.map((projectId) => (
              <option key={projectId} value={projectId}>
                {getPartialProjectById(projectId)?.name ?? "Untitled project"}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        role="menuitem"
        disabled={!hasWritableProject || isSaving}
        className="mt-2 flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-13 font-medium text-primary hover:bg-layer-transparent-hover disabled:cursor-not-allowed disabled:text-tertiary"
        onClick={handleSave}
      >
        <Star className="size-4 text-icon-tertiary" />
        {isSaving ? "Saving..." : "Save image to workspace"}
      </button>
      {!hasWritableProject && (
        <p className="px-2 pt-2 pb-1 text-12 text-tertiary">You need member access to a project to save images.</p>
      )}
      <div className="mt-1 flex items-center gap-1 px-2 py-1 text-11 text-tertiary">
        <Image className="size-3.5" />
        Saves as an image bookmark
      </div>
    </div>,
    document.body
  );
});
