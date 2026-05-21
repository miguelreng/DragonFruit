/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { ISearchIssueResponse, TIssue } from "@plane/types";
// components
import { IssueModalContext } from "@/components/issues/issue-modal/context";
// hooks
import { useUser } from "@/hooks/store/user/user-user";
// services
import { WorkItemTemplateService } from "@/services/issue/work-item-template.service";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

// Module-level singleton — the service holds no state, and creating a fresh
// one per render would defeat any HTTP-client connection reuse the APIService
// base class enables.
const templateService = new WorkItemTemplateService();

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  // states
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  // The picker writes the chosen template id here; form.tsx's useEffect
  // watches this state and calls handleTemplateChange below to actually
  // apply the template's defaults to the form fields.
  const [workItemTemplateId, setWorkItemTemplateId] = useState<string | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  /**
   * Fetches the selected template and resets the form fields to its
   * defaults. Empty fields on the template don't overwrite anything the
   * user already typed — the reset uses the current form values as the
   * base and merges template defaults over them only where the template
   * actually has a value.
   */
  const handleTemplateChange = useCallback(
    async ({
      workspaceSlug,
      reset,
      editorRef,
    }: {
      workspaceSlug: string;
      reset: (values: any) => void;
      editorRef: any;
    }) => {
      if (!workItemTemplateId || !workspaceSlug) return;
      setIsApplyingTemplate(true);
      try {
        const template = await templateService.retrieve(workspaceSlug, workItemTemplateId);
        // Only the fields the template actually fills get touched. The
        // form callback inherits any currently-typed values via react-hook-
        // form's reset(prev => ...). Editor description is set via the
        // ref directly because the editor isn't a controlled field.
        const next: Partial<TIssue> = {};
        if (template.default_name) next.name = template.default_name;
        if (template.default_priority) (next as any).priority = template.default_priority;
        if (template.default_assignee_ids?.length) (next as any).assignee_ids = template.default_assignee_ids;
        if (template.default_label_ids?.length) (next as any).label_ids = template.default_label_ids;
        reset((prev: Partial<TIssue>) => ({ ...prev, ...next }));
        if (template.default_description_html && editorRef?.current) {
          editorRef.current.setEditorValue?.(template.default_description_html);
        }
      } catch {
        // Best-effort — failures here just leave the form as-is. The picker
        // can be reopened to try a different template.
      } finally {
        setIsApplyingTemplate(false);
      }
    },
    [workItemTemplateId]
  );

  // Memoize the context value so the provider doesn't churn every render
  // and force consumers to re-render unnecessarily.
  const contextValue = useMemo(
    () => ({
      allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
      workItemTemplateId,
      setWorkItemTemplateId,
      isApplyingTemplate,
      setIsApplyingTemplate,
      selectedParentIssue,
      setSelectedParentIssue,
      issuePropertyValues: {},
      setIssuePropertyValues: () => {},
      issuePropertyValueErrors: {},
      setIssuePropertyValueErrors: () => {},
      getIssueTypeIdOnProjectChange: () => null,
      getActiveAdditionalPropertiesLength: () => 0,
      handlePropertyValuesValidation: () => true,
      handleCreateUpdatePropertyValues: () => Promise.resolve(),
      handleProjectEntitiesFetch: () => Promise.resolve(),
      handleTemplateChange,
      handleConvert: () => Promise.resolve(),
      handleCreateSubWorkItem: () => Promise.resolve(),
    }),
    [
      allowedProjectIds,
      projectIdsWithCreatePermissions,
      workItemTemplateId,
      isApplyingTemplate,
      selectedParentIssue,
      handleTemplateChange,
    ]
  );

  return <IssueModalContext.Provider value={contextValue}>{children}</IssueModalContext.Provider>;
});
