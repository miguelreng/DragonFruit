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
import { ArchiveIcon, StateGroupIcon } from "@/components/icons/propel-shim";
import { ChevronDown, Trash2, X } from "@/components/icons/lucide-shim";
// ui
import { CustomMenu } from "@plane/ui";
// hooks
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useIssues } from "@/hooks/store/use-issues";
import { useProjectState } from "@/hooks/store/use-project-state";

/**
 * Floating action bar that appears at the bottom of the project task list
 * whenever the user has selected one or more tasks. Mirrors the pattern
 * familiar from Linear / Notion / Gmail: pick the rows you want to act on,
 * the bar slides in with what you can do to them.
 *
 * Actions: selection count + Clear + Status (dropdown) + Archive + Delete.
 * Stackable — more bulk actions (priority, assignee, move-to-cycle) can
 * slot in alongside Status without restructuring the bar.
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
    issues: { removeBulkIssues, archiveBulkIssues, bulkUpdateProperties },
  } = useIssues(EIssuesStoreType.PROJECT);
  const { getProjectStates } = useProjectState();
  // state
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isChangingState, setIsChangingState] = useState(false);

  if (!isSelectionActive) return null;
  const count = selectedEntityIds.length;
  const projectStates = projectId ? getProjectStates(projectId.toString()) : undefined;

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

  const handleChangeState = async (stateId: string) => {
    if (!workspaceSlug || !projectId || isChangingState) return;
    setIsChangingState(true);
    try {
      await bulkUpdateProperties(workspaceSlug.toString(), projectId.toString(), {
        issue_ids: selectedEntityIds,
        properties: { state_id: stateId },
      });
      const stateName = projectStates?.find((s) => s.id === stateId)?.name;
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: stateName
          ? `Moved ${count} ${count === 1 ? "task" : "tasks"} to ${stateName}.`
          : `Updated ${count} ${count === 1 ? "task" : "tasks"}.`,
      });
      clearSelection();
    } catch (error) {
      console.error("Bulk state change failed:", error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: "Couldn't change the status. Please try again.",
      });
    } finally {
      setIsChangingState(false);
    }
  };

  const handleArchive = async () => {
    if (!workspaceSlug || !projectId || isArchiving) return;
    setIsArchiving(true);
    try {
      await archiveBulkIssues(workspaceSlug.toString(), projectId.toString(), selectedEntityIds);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: `${count} ${count === 1 ? "task" : "tasks"} archived.`,
      });
      clearSelection();
    } catch (error) {
      console.error("Bulk archive failed:", error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: "Couldn't archive the selected tasks. Please try again.",
      });
    } finally {
      setIsArchiving(false);
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
        <span className="px-1 text-11 font-medium">
          <span className="text-primary">{count}</span>{" "}
          <span className="text-tertiary">{count === 1 ? "task" : "tasks"} selected</span>
        </span>
        <div className="bg-strong h-4 w-px" aria-hidden />
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
        {/* Status change. CustomMenu is the same dropdown primitive used in
            the row quick-actions, so the styling matches the rest of the
            list. Disabled if states haven't loaded yet — usually they have
            because the user is already looking at the grouped-by-status
            view, but keeping the guard for the data-grid case. */}
        <CustomMenu
          customButton={
            <button
              type="button"
              disabled={isChangingState || !projectStates?.length}
              aria-label="Change status"
              className="inline-flex h-5 items-center gap-1 rounded-lg border border-strong bg-layer-2 px-1.5 text-caption-md-medium text-secondary shadow-raised-100 hover:bg-layer-2-hover active:bg-layer-2-active disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{isChangingState ? "Updating…" : "Status"}</span>
              <ChevronDown className="size-3" />
            </button>
          }
          placement="top-start"
          maxHeight="md"
          closeOnSelect
        >
          {projectStates?.length ? (
            projectStates.map((state) => (
              <CustomMenu.MenuItem
                key={state.id}
                onClick={() => handleChangeState(state.id)}
                className="flex items-center gap-2"
              >
                <StateGroupIcon stateGroup={state.group} color={state.color} className="size-3.5" />
                <span className="truncate">{state.name}</span>
              </CustomMenu.MenuItem>
            ))
          ) : (
            <CustomMenu.MenuItem disabled>
              <span className="text-tertiary">No states available</span>
            </CustomMenu.MenuItem>
          )}
        </CustomMenu>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleArchive}
          disabled={isArchiving || isDeleting || isChangingState}
          aria-label="Archive"
        >
          <ArchiveIcon className="size-3.5" />
          <span>{isArchiving ? "Archiving…" : "Archive"}</span>
        </Button>
        <Button
          variant="error-outline"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting || isArchiving || isChangingState}
          aria-label={t("common.delete") || "Delete"}
        >
          <Trash2 className="size-3.5" />
          <span>{isDeleting ? t("common.deleting") || "Deleting…" : t("common.delete") || "Delete"}</span>
        </Button>
      </div>
    </div>
  );
});
