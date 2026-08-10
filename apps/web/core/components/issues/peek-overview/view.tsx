/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { createPortal } from "react-dom";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import type { TNameDescriptionLoader } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import useKeypress from "@/hooks/use-keypress";
import usePeekOverviewOutsideClickDetector from "@/hooks/use-peek-overview-outside-click";
// local imports
import type { TIssueOperations } from "../issue-detail";
import { IssueActivity } from "../issue-detail/issue-activity";
import { IssueDetailWidgets } from "../issue-detail-widgets";
import { IssuePeekOverviewError } from "./error";
import type { TPeekModes } from "./header";
import { IssuePeekOverviewHeader } from "./header";
import { PeekOverviewIssueDetails } from "./issue-detail";
import { IssuePeekOverviewLoader } from "./loader";
import { PeekOverviewProperties } from "./properties";

interface IIssueView {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  isLoading?: boolean;
  isError?: boolean;
  is_archived: boolean;
  disabled?: boolean;
  embedIssue?: boolean;
  embedRemoveCurrentNotification?: () => void;
  issueOperations: TIssueOperations;
}

export const IssueView = observer(function IssueView(props: IIssueView) {
  const {
    workspaceSlug,
    projectId,
    issueId,
    isLoading,
    isError,
    is_archived,
    disabled = false,
    embedIssue = false,
    embedRemoveCurrentNotification,
    issueOperations,
  } = props;
  // states
  const [peekMode, setPeekMode] = useState<TPeekModes>("side-peek");
  const [isSubmitting, setIsSubmitting] = useState<TNameDescriptionLoader>("saved");
  const [isDeleteIssueModalOpen, setIsDeleteIssueModalOpen] = useState(false);
  const [isArchiveIssueModalOpen, setIsArchiveIssueModalOpen] = useState(false);
  const [isDuplicateIssueModalOpen, setIsDuplicateIssueModalOpen] = useState(false);
  const [isEditIssueModalOpen, setIsEditIssueModalOpen] = useState(false);
  // ref
  const issuePeekOverviewRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorRefApi>(null);
  // store hooks
  const {
    setPeekIssue,
    isPeekPinned,
    peekSide,
    setPeekSide,
    isAnyModalOpen,
    issue: { getIssueById },
  } = useIssueDetail();
  const { isAnyModalOpen: isAnyEpicModalOpen } = useIssueDetail(EIssueServiceType.EPICS);
  const issue = getIssueById(issueId);
  // remove peek id
  const removeRoutePeekId = () => {
    setPeekIssue(undefined);
    if (embedIssue && embedRemoveCurrentNotification) embedRemoveCurrentNotification();
  };

  const toggleDeleteIssueModal = (value: boolean) => setIsDeleteIssueModalOpen(value);
  const toggleArchiveIssueModal = (value: boolean) => setIsArchiveIssueModalOpen(value);
  const toggleDuplicateIssueModal = (value: boolean) => setIsDuplicateIssueModalOpen(value);
  const toggleEditIssueModal = (value: boolean) => setIsEditIssueModalOpen(value);

  const isAnyLocalModalOpen =
    isDeleteIssueModalOpen || isArchiveIssueModalOpen || isDuplicateIssueModalOpen || isEditIssueModalOpen;

  usePeekOverviewOutsideClickDetector(
    issuePeekOverviewRef,
    () => {
      // A pinned drawer stays open while the user works elsewhere — that's
      // the whole point of pinning. Only the explicit close button closes it.
      if (isPeekPinned) return;
      const isAnyDropbarOpen = editorRef.current?.isAnyDropbarOpen();
      if (!embedIssue) {
        if (!isAnyModalOpen && !isAnyEpicModalOpen && !isAnyLocalModalOpen && !isAnyDropbarOpen) {
          removeRoutePeekId();
        }
      }
    },
    issueId,
    ["main-sidebar"]
  );

  const handleKeyDown = () => {
    if (isPeekPinned) return;
    const editorImageFullScreenModalElement = document.querySelector(".editor-image-full-screen-modal");
    const dropdownElement = document.activeElement?.tagName === "INPUT";
    const isAnyDropbarOpen = editorRef.current?.isAnyDropbarOpen();
    if (!isAnyModalOpen && !dropdownElement && !isAnyDropbarOpen && !editorImageFullScreenModalElement) {
      removeRoutePeekId();
      const issueElement = document.getElementById(`issue-${issueId}`);
      if (issueElement) issueElement?.focus();
    }
  };

  useKeypress("Escape", () => !embedIssue && handleKeyDown());

  const handleRestore = async () => {
    if (!issueOperations.restore) return;
    await issueOperations.restore(workspaceSlug, projectId, issueId);
    removeRoutePeekId();
  };

  const peekOverviewIssueClassName = cn(
    !embedIssue
      ? "t-panel-slide absolute z-[25] flex flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1 transition-all duration-300"
      : `h-full w-full`,
    !embedIssue && {
      "top-0 bottom-0 w-full border-0 md:w-[50%]": peekMode === "side-peek",
      "right-0 border-l": peekMode === "side-peek" && peekSide === "right",
      "left-0 border-r": peekMode === "side-peek" && peekSide === "left",
      "top-[8.33%] left-[8.33%] size-5/6": peekMode === "modal",
      "absolute inset-0 m-4": peekMode === "full-screen",
    }
  );

  // Drag the drawer by its header to dock it on the other screen edge. The
  // drawer follows the pointer with a transform while dragging; on release
  // it snaps to whichever half of the viewport the pointer ended in. Clicks
  // stay clicks — dragging only engages past a small movement threshold and
  // never starts on interactive elements.
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (embedIssue || peekMode !== "side-peek") return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']")) return;
    const el = issuePeekOverviewRef.current;
    if (!el) return;
    const startX = e.clientX;
    let dragging = false;
    let lastX = startX;
    const finish = (endX: number | null, expectClick: boolean) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("mouseup", onMouseEnd);
      document.removeEventListener("pointercancel", onCancel);
      if (!dragging) return;
      document.body.style.userSelect = "";
      el.style.transition = "";
      el.style.transform = "";
      if (endX !== null) {
        // clientWidth fallback: window.innerWidth reads 0 in some embedded
        // browser panes.
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        setPeekSide(endX < viewportWidth / 2 ? "left" : "right");
      }
      // Swallow the click that follows a drag release — if the pointer ends
      // over the page (fast fling past the drawer edge), that click would
      // otherwise activate whatever sits under it (open another task, close
      // the drawer via click-outside, ...). Only armed for real releases —
      // pointercancel produces no click, and a lingering swallower would eat
      // the user's next genuine click. The click, if any, dispatches
      // synchronously after the release, so disarm on the next tick.
      if (expectClick) {
        const squelch = (ce: MouseEvent) => ce.stopPropagation();
        document.addEventListener("click", squelch, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", squelch, { capture: true }), 0);
      }
    };
    const onMove = (ev: PointerEvent) => {
      lastX = ev.clientX;
      const dx = ev.clientX - startX;
      if (!dragging && Math.abs(dx) < 8) return;
      dragging = true;
      document.body.style.userSelect = "none";
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
    };
    // Some environments end a drag with mouseup but no pointerup (and the
    // browser can abort one with pointercancel) — treat any of the three as
    // the release so the drawer never sticks mid-screen on a stale transform.
    const onPointerEnd = (ev: PointerEvent) => finish(ev.clientX, true);
    const onMouseEnd = (ev: MouseEvent) => finish(ev.clientX, true);
    const onCancel = () => finish(lastX, false);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onPointerEnd);
    document.addEventListener("mouseup", onMouseEnd);
    document.addEventListener("pointercancel", onCancel);
  };

  const shouldUsePortal = !embedIssue;

  const portalContainer = document.getElementById("full-screen-portal") as HTMLElement;

  const content = (
    <div className="w-full text-body-sm-regular">
      {issueId && (
        <div
          ref={issuePeekOverviewRef}
          data-open={!embedIssue ? "true" : undefined}
          className={peekOverviewIssueClassName}
          style={{
            boxShadow:
              "0px 4px 8px 0px rgba(0, 0, 0, 0.12), 0px 6px 12px 0px rgba(16, 24, 40, 0.12), 0px 1px 16px 0px rgba(16, 24, 40, 0.12)",
          }}
        >
          {isError ? (
            <div className="relative h-screen w-full overflow-hidden">
              <IssuePeekOverviewError removeRoutePeekId={removeRoutePeekId} />
            </div>
          ) : (
            isLoading && <IssuePeekOverviewLoader removeRoutePeekId={removeRoutePeekId} />
          )}
          {!isLoading && !isError && issue && (
            <>
              {/* header — in side-peek mode it doubles as the drag handle for
                  docking the drawer to the left or right screen edge */}
              <div
                onPointerDown={handleHeaderPointerDown}
                className={cn(!embedIssue && peekMode === "side-peek" && "cursor-grab")}
              >
                <IssuePeekOverviewHeader
                  peekMode={peekMode}
                  setPeekMode={(value) => setPeekMode(value)}
                  removeRoutePeekId={removeRoutePeekId}
                  toggleDeleteIssueModal={toggleDeleteIssueModal}
                  toggleArchiveIssueModal={toggleArchiveIssueModal}
                  toggleDuplicateIssueModal={toggleDuplicateIssueModal}
                  toggleEditIssueModal={toggleEditIssueModal}
                  handleRestoreIssue={handleRestore}
                  isArchived={is_archived}
                  issueId={issueId}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  isSubmitting={isSubmitting}
                  disabled={disabled}
                  embedIssue={embedIssue}
                />
              </div>
              {/* content */}
              <div className="vertical-scrollbar relative scrollbar-md h-full w-full overflow-hidden overflow-y-auto">
                {["side-peek", "modal"].includes(peekMode) ? (
                  <div className="relative flex flex-col gap-3 space-y-3 px-8 py-5">
                    <PeekOverviewIssueDetails
                      editorRef={editorRef}
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      issueId={issueId}
                      issueOperations={issueOperations}
                      disabled={disabled}
                      isArchived={is_archived}
                      isSubmitting={isSubmitting}
                      setIsSubmitting={(value) => setIsSubmitting(value)}
                    />

                    <div className="py-2">
                      <IssueDetailWidgets
                        workspaceSlug={workspaceSlug}
                        projectId={projectId}
                        issueId={issueId}
                        disabled={disabled || is_archived}
                        issueServiceType={EIssueServiceType.ISSUES}
                      />
                    </div>

                    <PeekOverviewProperties
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      issueId={issueId}
                      issueOperations={issueOperations}
                      disabled={disabled || is_archived}
                    />

                    <IssueActivity
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      issueId={issueId}
                      disabled={is_archived}
                    />
                  </div>
                ) : (
                  <div className="vertical-scrollbar flex h-full w-full overflow-auto">
                    <div className="relative h-full w-full space-y-6 overflow-auto p-4 py-5">
                      <div className="space-y-3">
                        <PeekOverviewIssueDetails
                          editorRef={editorRef}
                          workspaceSlug={workspaceSlug}
                          projectId={projectId}
                          issueId={issueId}
                          issueOperations={issueOperations}
                          disabled={disabled}
                          isArchived={is_archived}
                          isSubmitting={isSubmitting}
                          setIsSubmitting={(value) => setIsSubmitting(value)}
                        />

                        <div className="py-2">
                          <IssueDetailWidgets
                            workspaceSlug={workspaceSlug}
                            projectId={projectId}
                            issueId={issueId}
                            disabled={disabled}
                            issueServiceType={EIssueServiceType.ISSUES}
                          />
                        </div>

                        <IssueActivity
                          workspaceSlug={workspaceSlug}
                          projectId={projectId}
                          issueId={issueId}
                          disabled={is_archived}
                        />
                      </div>
                    </div>
                    <div
                      className={`vertical-scrollbar scrollbar-sm h-full !w-[400px] flex-shrink-0 overflow-hidden border-l border-subtle p-4 py-5 ${
                        is_archived ? "pointer-events-none" : ""
                      }`}
                    >
                      <PeekOverviewProperties
                        workspaceSlug={workspaceSlug}
                        projectId={projectId}
                        issueId={issueId}
                        issueOperations={issueOperations}
                        disabled={disabled || is_archived}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  return <>{shouldUsePortal && portalContainer ? createPortal(content, portalContainer) : content}</>;
});
