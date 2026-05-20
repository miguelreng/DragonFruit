/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EIssuesStoreType } from "@plane/types";
// icons
import { Trash2, X } from "@/components/icons/lucide-shim";
// hooks
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useIssues } from "@/hooks/store/use-issues";

/**
 * Floating action bar that appears at the bottom of the project task list
 * whenever the user has selected one or more tasks. Mirrors the pattern
 * familiar from Linear / Notion / Gmail: pick the rows you want to act on,
 * the bar slides in with what you can do to them.
 *
 * Scope (v1): selection count + Clear + Delete. Designed so we can stack
 * more actions onto the same row later (state change, priority, assignee,
 * move-to-cycle, etc.) without restructuring the bar.
 *
 * Visibility is driven by the multiple-select store — when the user clears
 * the selection (Esc, clicking the X here, or routing away), the store
 * empties and the bar unmounts via its `isSelectionActive` gate.
 */
export const SelectionFloatingBar = observer(function SelectionFloatingBar() {
  // routing
  const { workspaceSlug, projectId } = useParams();
  // i18n
  const { t } = useTranslation();
  // store
  const { selectedEntityIds, isSelectionActive, clearSelection } = useMultipleSelectStore();
  const {
    issues: { removeBulkIssues },
  } = useIssues(EIssuesStoreType.PROJECT);
  // state
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isSelectionActive) return null;
  const count = selectedEntityIds.length;

  const handleDelete = async () => {
    if (!workspaceSlug || !projectId || isDeleting) return;
    // Confirm before the destructive action. The native confirm is the
    // pragmatic placeholder — once we add more bulk actions and a real
    // confirmation modal, swap this for it.
    const ok = window.confirm(
      t("bulk_actions.delete.confirm", { count }) ||
        `Delete ${count} ${count === 1 ? "task" : "tasks"}? This can't be undone.`
    );
    if (!ok) return;
    setIsDeleting(true);
    try {
      await removeBulkIssues(workspaceSlug.toString(), projectId.toString(), selectedEntityIds);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("bulk_actions.delete.success", { count }) || `${count} ${count === 1 ? "task" : "tasks"} deleted.`,
      });
      clearSelection();
    } catch (error) {
      console.error("Bulk delete failed:", error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("bulk_actions.delete.error") || "Couldn't delete the selected tasks. Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label={`${count} selected`}
      // Fixed so it stays at the bottom of the viewport even when the list
      // scrolls. Centered horizontally; the inner content sets its own width.
      className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
    >
      <div className="shadow-lg pointer-events-auto flex items-center gap-2 rounded-xl border border-strong bg-surface-1 px-3 py-2">
        <span className="text-sm px-2 font-medium">
          <span className="text-primary">{count}</span>{" "}
          <span className="text-tertiary">{count === 1 ? "task" : "tasks"} selected</span>
        </span>
        <div className="bg-strong h-5 w-px" aria-hidden />
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          // Tooltip would be nice; keep it terse on the button for now.
          aria-label={t("common.clear") || "Clear selection"}
        >
          <X className="size-3.5" />
          <span>{t("common.clear") || "Clear"}</span>
        </Button>
        <Button
          variant="error-outline"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label={t("common.delete") || "Delete"}
        >
          <Trash2 className="size-3.5" />
          <span>{isDeleting ? t("common.deleting") || "Deleting…" : t("common.delete") || "Delete"}</span>
        </Button>
      </div>
    </div>
  );
});
