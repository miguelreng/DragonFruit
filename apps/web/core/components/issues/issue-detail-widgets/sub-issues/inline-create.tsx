/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSubIssueOperations } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
// icons
import { Loader2, Plus } from "@/components/icons/lucide-shim";
// hooks
import { useIssues } from "@/hooks/store/use-issues";

type Props = {
  workspaceSlug: string;
  projectId: string;
  parentIssueId: string;
  subIssueOperations: TSubIssueOperations;
  activationRequestId?: number;
};

/**
 * Inline "+ Add subtask" row.
 *
 * Replaces the full create-issue modal for the common case where you just
 * want to jot down "do X, do Y, do Z" under a parent task and move on. The
 * UX:
 *   - Always visible: a single-line input; Enter creates and *keeps focus*
 *     so the user can rip through several subtasks in a row; Esc clears.
 *   - While the network round-trip is in flight the input stays editable
 *     but a small spinner replaces the plus icon — submitting again would
 *     be ignored.
 */
export const InlineCreateSubIssue = observer(function InlineCreateSubIssue(props: Props) {
  const { workspaceSlug, projectId, parentIssueId, subIssueOperations, activationRequestId } = props;
  // i18n
  const { t } = useTranslation();
  // store
  const {
    issues: { createIssue },
  } = useIssues(EIssuesStoreType.PROJECT);
  // state
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activationRequestId === undefined) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [activationRequestId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Two-step create: (1) make the issue with parent_id set so the
      // backend writes the parent relationship; (2) tell the sub-issues
      // store about it so the local subtasks list updates without a
      // re-fetch. This mirrors what the modal flow does after submit.
      const created = await createIssue(workspaceSlug, projectId, {
        name: trimmed,
        parent_id: parentIssueId,
      });
      if (created?.id) {
        await subIssueOperations.addSubIssue(workspaceSlug, projectId, parentIssueId, [created.id]);
      }
      setName("");
      // Keep focus on the input so the user can immediately type another
      // subtask. This is the whole point of the inline pattern — speed.
      inputRef.current?.focus();
    } catch (error) {
      console.error("Failed to create subtask inline:", error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("sub_work_item.create.error") || "Couldn't create the subtask. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setName("");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="focus-within:border-primary mt-2 flex w-full items-center gap-2 rounded-lg border border-strong bg-surface-1 px-2 py-2"
    >
      {isSubmitting ? (
        <Loader2 className="size-3.5 flex-shrink-0 animate-spin text-tertiary" />
      ) : (
        <Plus className="size-3.5 flex-shrink-0 text-tertiary" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("sub_work_item.add.placeholder")}
        className="flex-1 rounded-lg bg-transparent text-body-xs-regular text-primary placeholder:text-tertiary focus:outline-none"
        // Bound long names server-side; for the inline path keep it loose
        // and let validation surface as a toast.
        maxLength={255}
        readOnly={isSubmitting}
      />
    </form>
  );
});
