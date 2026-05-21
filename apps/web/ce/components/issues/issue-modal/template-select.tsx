/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { ChevronDown } from "@/components/icons/lucide-shim";
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import { WorkItemTemplateService, type TWorkItemTemplate } from "@/services/issue/work-item-template.service";

export type TWorkItemTemplateDropdownSize = "xs" | "sm";

export type TWorkItemTemplateSelect = {
  projectId: string | null;
  typeId: string | null;
  disabled?: boolean;
  size?: TWorkItemTemplateDropdownSize;
  placeholder?: string;
  renderChevron?: boolean;
  dropDownContainerClassName?: string;
  handleModalClose: () => void;
  handleFormChange?: () => void;
  /**
   * Called after the user picks a template — the parent issue modal uses
   * this hook to instantiate the template into a real Issue via the
   * WorkItemTemplateService and (typically) close the create modal,
   * letting the new task surface in the list naturally.
   */
  onTemplateSelected?: (template: TWorkItemTemplate) => void;
};

const templateService = new WorkItemTemplateService();

/**
 * "Apply template" picker that sits at the top of the issue create form.
 * Lists workspace-scoped Work Item templates; on selection the parent
 * decides what to do with the chosen template (typically: call the
 * `instantiate` endpoint and close the modal — done in the parent so
 * this component stays pure).
 *
 * Renders nothing when there are no templates so an empty workspace
 * doesn't get a useless dropdown taking up real estate.
 */
export function WorkItemTemplateSelect(props: TWorkItemTemplateSelect) {
  const {
    disabled = false,
    size = "sm",
    placeholder = "Apply template",
    renderChevron = true,
    dropDownContainerClassName,
    onTemplateSelected,
  } = props;
  const { workspaceSlug } = useParams();
  const [templates, setTemplates] = useState<TWorkItemTemplate[]>([]);
  // Optional — the issue modal mounts a context that exposes
  // setWorkItemTemplateId so the form can react to template selection.
  // We pull from it when present so the existing form.tsx useEffect
  // (which watches workItemTemplateId) does the actual field reset.
  const modalContext = useContext(IssueModalContext);

  useEffect(() => {
    if (!workspaceSlug) return;
    let cancelled = false;
    templateService
      .list(workspaceSlug.toString())
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
        return rows;
      })
      .catch(() => {
        // Failing the fetch shouldn't break the modal — just leave the
        // dropdown empty (the component renders nothing in that case).
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  if (templates.length === 0) return null;

  const triggerSize = size === "xs" ? "text-11 px-2 py-1" : "text-12 px-2.5 py-1.5";

  return (
    <div className={cn("flex items-center", dropDownContainerClassName)}>
      <CustomMenu
        disabled={disabled}
        customButton={
          <div
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-md border-[0.5px] border-subtle bg-layer-1 text-tertiary hover:bg-layer-2 hover:text-primary",
              triggerSize
            )}
          >
            <span>{placeholder}</span>
            {renderChevron && <ChevronDown className="size-3" />}
          </div>
        }
        placement="bottom-start"
        menuItemsClassName="w-64 max-h-72 overflow-y-auto"
      >
        {templates.map((t) => (
          <CustomMenu.MenuItem
            key={t.id}
            onClick={() => {
              // Caller-supplied callback wins when present; otherwise fall
              // back to the modal context's setter (the form watches
              // workItemTemplateId via useEffect and applies the template).
              if (onTemplateSelected) onTemplateSelected(t);
              else modalContext?.setWorkItemTemplateId?.(t.id);
            }}
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-13 text-primary">{t.name}</span>
              {t.description && <span className="truncate text-11 text-tertiary">{t.description}</span>}
            </div>
          </CustomMenu.MenuItem>
        ))}
      </CustomMenu>
    </div>
  );
}
