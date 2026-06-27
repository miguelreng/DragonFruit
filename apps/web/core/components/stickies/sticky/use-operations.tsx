/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
// plane types
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { InstructionType, TSticky } from "@plane/types";
// plane utils
import { isCommentEmpty } from "@plane/utils";
// components
import { STICKY_COLORS_LIST } from "@/components/editor/sticky-editor/color-palette";
// hooks
import { useSticky } from "@/hooks/use-stickies";

export type TOperations = {
  create: (data?: Partial<TSticky>) => Promise<void>;
  update: (stickyId: string, data: Partial<TSticky>) => Promise<void>;
  remove: (stickyId: string) => Promise<void>;
  updatePosition: (
    workspaceSlug: string,
    sourceId: string,
    droppedId: string,
    instruction: InstructionType
  ) => Promise<void>;
};

type TProps = {
  workspaceSlug: string;
};

export const getRandomStickyColor = (): string => {
  const randomIndex = Math.floor(Math.random() * STICKY_COLORS_LIST.length);
  return STICKY_COLORS_LIST[randomIndex].key;
};

export const useStickyOperations = (props: TProps) => {
  const { workspaceSlug } = props;
  // Auto-scope to the current project (when the route has one) so the same hook
  // powers both the workspace board and a project's Stickies tab.
  const { projectId } = useParams();
  const projectIdStr = projectId ? projectId.toString() : undefined;
  // store hooks
  const { stickies, getWorkspaceStickyIds, createSticky, updateSticky, deleteSticky, updateStickyPosition } =
    useSticky();
  const { t } = useTranslation();

  const isValid = useCallback(
    (data: Partial<TSticky>) => {
      if (data.name && data.name.length > 100) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("stickies.toasts.not_updated.title"),
          message: t("stickies.toasts.errors.wrong_name"),
        });
        return false;
      }
      return true;
    },
    [t]
  );

  const stickyOperations: TOperations = useMemo(
    () => ({
      create: async (data?: Partial<TSticky>) => {
        try {
          const payload: Partial<TSticky> = {
            background_color: getRandomStickyColor(),
            ...data,
          };
          const workspaceStickIds = getWorkspaceStickyIds(projectIdStr ?? workspaceSlug);
          // check if latest sticky is empty
          if (workspaceStickIds && workspaceStickIds.length >= 0) {
            const latestSticky = stickies[workspaceStickIds[0]];
            const hasLatestTitle = Boolean(latestSticky?.name?.trim());
            const hasLatestDescription = Boolean(
              latestSticky?.description_html && !isCommentEmpty(latestSticky.description_html)
            );
            if (latestSticky && !hasLatestTitle && !hasLatestDescription) {
              setToast({
                message: t("stickies.toasts.errors.already_exists"),
                type: TOAST_TYPE.WARNING,
                title: t("stickies.toasts.not_created.title"),
              });
              return;
            }
          }
          if (!workspaceSlug) throw new Error("Missing required fields");
          if (!isValid(payload)) return;
          await createSticky(workspaceSlug, payload, projectIdStr);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("stickies.toasts.created.title"),
            message: t("stickies.toasts.created.message"),
          });
        } catch (error: any) {
          console.error("Error in creating sticky:", error);
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("stickies.toasts.not_created.title"),
            message: error?.data?.error ?? t("stickies.toasts.not_created.message"),
          });
        }
      },
      update: async (stickyId: string, data: Partial<TSticky>) => {
        try {
          if (!workspaceSlug) throw new Error("Missing required fields");
          if (!isValid(data)) return;
          await updateSticky(workspaceSlug, stickyId, data);
        } catch (error) {
          console.error("Error in updating sticky:", error);
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("stickies.toasts.not_updated.title"),
            message: t("stickies.toasts.not_updated.message"),
          });
        }
      },
      remove: async (stickyId: string) => {
        try {
          if (!workspaceSlug) throw new Error("Missing required fields");
          await deleteSticky(workspaceSlug, stickyId, projectIdStr);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("stickies.toasts.removed.title"),
            message: t("stickies.toasts.removed.message"),
          });
        } catch (error) {
          console.error("Error in removing sticky:", error);
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("stickies.toasts.not_removed.title"),
            message: t("stickies.toasts.not_removed.message"),
          });
        }
      },
      updatePosition: async (
        targetWorkspaceSlug: string,
        sourceId: string,
        droppedId: string,
        instruction: InstructionType
      ) => {
        try {
          if (!targetWorkspaceSlug) throw new Error("Missing required fields");
          await updateStickyPosition(targetWorkspaceSlug, sourceId, droppedId, instruction, projectIdStr);
        } catch (error) {
          console.error("Error in updating sticky position:", error);
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("stickies.toasts.not_updated.title"),
            message: t("stickies.toasts.not_updated.message"),
          });
        }
      },
    }),
    [
      createSticky,
      deleteSticky,
      getWorkspaceStickyIds,
      isValid,
      projectIdStr,
      stickies,
      t,
      updateSticky,
      updateStickyPosition,
      workspaceSlug,
    ]
  );

  return {
    stickyOperations,
  };
};
