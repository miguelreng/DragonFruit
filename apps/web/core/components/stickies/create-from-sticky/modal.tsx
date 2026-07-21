/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Button } from "@plane/propel/button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
import { ChevronDown, FileText, ListChecks, X } from "@/components/icons/lucide-shim";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user/user-user";
import { IssueService } from "@/services/issue";
import { ProjectPageService } from "@/services/page/project-page.service";
import {
  buildStickyTargetPayload,
  resolveStickyTargetTitle,
  type TStickyTarget,
  type TStickyTargetSnapshot,
} from "./helpers";

const issueService = new IssueService();
const pageService = new ProjectPageService();

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  stickyId: string;
  snapshot: TStickyTargetSnapshot;
  stickyProjectId?: string | null;
};

const getErrorMessage = (error: unknown): string => {
  if (typeof error === "string" && error.trim()) return error;
  if (!error || typeof error !== "object") return "We couldn't create this item. Please try again.";

  const errorRecord = error as Record<string, unknown>;
  for (const key of ["detail", "message", "error"]) {
    const value = errorRecord[key];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }

  return "We couldn't create this item. Please try again.";
};

const TARGET_OPTIONS: {
  description: string;
  icon: typeof FileText;
  label: string;
  value: TStickyTarget;
}[] = [
  {
    value: "doc",
    label: "Doc",
    description: "Create a private document.",
    icon: FileText,
  },
  {
    value: "task",
    label: "Task",
    description: "Create work with project defaults.",
    icon: ListChecks,
  },
];

export const CreateFromStickyModal = observer(function CreateFromStickyModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, stickyId, snapshot, stickyProjectId } = props;
  const { projectId: routeProjectId } = useParams();
  const [target, setTarget] = useState<TStickyTarget | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wasOpenRef = useRef(false);

  const { projectsWithCreatePermissions } = useUser();
  const { getProjectById, getProjectIdentifierById, joinedProjectIds } = useProject();

  const eligibleProjectIds = useMemo(
    () =>
      joinedProjectIds.filter(
        (joinedProjectId) =>
          Boolean(projectsWithCreatePermissions?.[joinedProjectId]) && !getProjectById(joinedProjectId)?.archived_at
      ),
    [getProjectById, joinedProjectIds, projectsWithCreatePermissions]
  );
  const eligibleProjectIdSet = useMemo(() => new Set(eligibleProjectIds), [eligibleProjectIds]);
  const resolvedTitle = resolveStickyTargetTitle(snapshot);
  const selectedProject = getProjectById(projectId);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;

    wasOpenRef.current = true;
    setTarget(null);
    setError(null);
    setIsSubmitting(false);
    setProjectId(
      stickyProjectId && eligibleProjectIdSet.has(stickyProjectId)
        ? stickyProjectId
        : typeof routeProjectId === "string" && eligibleProjectIdSet.has(routeProjectId)
          ? routeProjectId
          : null
    );
  }, [eligibleProjectIdSet, isOpen, routeProjectId, stickyProjectId]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !target || !projectId || !eligibleProjectIdSet.has(projectId)) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const mappedPayload = buildStickyTargetPayload(target, snapshot);
      let href: string;

      if (mappedPayload.target === "doc") {
        const page = await pageService.create(workspaceSlug, projectId, mappedPayload.payload);
        if (!page.id) throw new Error("The doc was created without a destination link.");
        href = `/${workspaceSlug}/projects/${projectId}/pages/${page.id}`;
      } else {
        const issue = await issueService.createIssue(workspaceSlug, projectId, mappedPayload.payload);
        if (!issue.id) throw new Error("The task was created without a destination link.");
        const projectIdentifier = getProjectIdentifierById(projectId);
        href =
          projectIdentifier && issue.sequence_id
            ? generateWorkItemLink({
                workspaceSlug,
                projectId,
                issueId: issue.id,
                projectIdentifier,
                sequenceId: issue.sequence_id,
                isEpic: false,
              })
            : `/${workspaceSlug}/projects/${projectId}/issues/${issue.id}`;
      }

      onClose();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: target === "doc" ? "Doc created from sticky" : "Task created from sticky",
        message: resolvedTitle,
        actionItems: <a href={href}>{target === "doc" ? "Open doc" : "Open task"}</a>,
      });
    } catch (submissionError) {
      console.error("Failed to create from sticky", submissionError);
      setError(getErrorMessage(submissionError));
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.MD}
      className="overflow-hidden"
    >
      <form onSubmit={handleSubmit} data-sticky-id={stickyId} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-16 font-semibold text-primary">Create from sticky</h2>
              <p className="mt-1 text-13 text-secondary">Choose what this note should become.</p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              aria-label="Close"
              className="-m-1 rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-2 hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-subtle focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </div>

          <fieldset className="mt-5" disabled={isSubmitting}>
            <legend className="mb-2 text-12 font-medium text-secondary">Create a</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TARGET_OPTIONS.map((option) => {
                const isSelected = target === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "cursor-pointer rounded-lg border p-3.5 transition-colors focus-within:ring-2 focus-within:ring-accent-subtle focus-within:outline-none",
                      isSelected
                        ? "border-accent-strong bg-accent-primary/5"
                        : "border-subtle hover:border-strong hover:bg-surface-2",
                      isSubmitting && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <input
                      type="radio"
                      name={`create-from-sticky-${stickyId}`}
                      value={option.value}
                      checked={isSelected}
                      onChange={() => {
                        setTarget(option.value);
                        setError(null);
                      }}
                      className="sr-only"
                    />
                    <span className="flex items-center gap-2 text-13 font-medium text-primary">
                      <option.icon className="size-4 text-secondary" />
                      {option.label}
                    </span>
                    <span className="mt-1 block text-11 leading-4 text-tertiary">{option.description}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5">
            <span className="mb-2 block text-12 font-medium text-secondary">Project</span>
            {eligibleProjectIds.length > 0 ? (
              <div className="h-9 rounded-lg border border-subtle bg-surface-1 transition-colors focus-within:border-accent-strong focus-within:ring-2 focus-within:ring-accent-subtle hover:border-strong">
                <ProjectDropdown
                  value={projectId}
                  onChange={(value) => {
                    setProjectId(value);
                    setError(null);
                  }}
                  multiple={false}
                  buttonVariant="border-with-text"
                  button={
                    <span className="flex h-full w-full items-center justify-between gap-2 px-3 text-13">
                      <span className={cn("truncate", selectedProject ? "text-primary" : "text-secondary")}>
                        {selectedProject?.name ?? "Select a project"}
                      </span>
                      <ChevronDown className="size-3 shrink-0 text-tertiary" aria-hidden="true" />
                    </span>
                  }
                  buttonContainerClassName="h-full w-full"
                  placeholder="Select a project"
                  disabled={isSubmitting}
                  renderCondition={(candidateProjectId) => eligibleProjectIdSet.has(candidateProjectId)}
                />
              </div>
            ) : (
              <p className="rounded-lg border border-subtle bg-surface-2 px-3 py-2.5 text-12 text-secondary">
                You don’t have an active project where you can create content.
              </p>
            )}
          </div>

          <div className="mt-5 rounded-lg border border-subtle-1 bg-surface-2 px-3.5 py-3">
            <p className="truncate text-13 font-medium text-primary" title={resolvedTitle}>
              {resolvedTitle}
            </p>
            <p className="mt-0.5 text-11 text-secondary">Your sticky will stay here.</p>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-12 text-danger-primary">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-subtle bg-surface-1 px-5 py-4 sm:px-6">
          <Button type="button" variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isSubmitting}
            disabled={!target || !projectId || !eligibleProjectIdSet.has(projectId) || isSubmitting}
          >
            {isSubmitting
              ? "Creating…"
              : target === "doc"
                ? "Create doc"
                : target === "task"
                  ? "Create task"
                  : "Create"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
