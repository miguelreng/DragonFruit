/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CustomMenu } from "@plane/ui";
// components
import { ChevronDown } from "@/components/icons/lucide-shim";
// services
import type { TProjectTemplate } from "@/services/project/project-template.service";

export type TProjectTemplateSelect = {
  templates: TProjectTemplate[];
  selectedTemplateId: string;
  onTemplateChange: (templateId: string) => void;
  disabled?: boolean;
};

/**
 * "Start from" picker that sits at the top of the project create form.
 * One row for "Blank project" + one per template. Selecting a template
 * triggers a side-effect in the parent that pre-fills form defaults
 * (description, network, logo); selecting "Blank" clears the template
 * but leaves whatever the user has already typed.
 *
 * Uses `CustomMenu` (not a native `<select>`) for consistency with the
 * rest of the design system — same picker shape as the agent chat
 * dropdown and the comment quick-actions menu.
 */
export function ProjectTemplateSelect(props: TProjectTemplateSelect) {
  const { templates, selectedTemplateId, onTemplateChange, disabled } = props;
  const selected = templates.find((t) => t.id === selectedTemplateId);
  const triggerLabel = selected?.name ?? "Blank project";

  return (
    <div className="flex items-center gap-3">
      {/* span, not label — there's no native form control to point
          `htmlFor` at (the trigger is a non-input <div> that
          CustomMenu wraps in its own <button>). Visual label only. */}
      <span className="text-12 shrink-0 text-tertiary">Start from</span>
      <CustomMenu
        disabled={disabled}
        customButton={
          // div, not button — CustomMenu wraps customButton in its
          // own <button> internally. Avoids nested-button HTML.
          <div className="border-subtle bg-layer-1 text-13 hover:bg-layer-2 flex w-full min-w-[220px] cursor-pointer items-center justify-between rounded-md border-[0.5px] px-3 py-2 text-primary">
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="size-3.5 text-tertiary" />
          </div>
        }
        placement="bottom-start"
        menuItemsClassName="w-72 max-h-72 overflow-y-auto"
      >
        <CustomMenu.MenuItem onClick={() => onTemplateChange("")}>
          <div className="flex flex-col">
            <span className="text-13 text-primary">Blank project</span>
            <span className="text-11 text-tertiary">Start from scratch</span>
          </div>
        </CustomMenu.MenuItem>
        {templates.map((t) => (
          <CustomMenu.MenuItem key={t.id} onClick={() => onTemplateChange(t.id)}>
            <div className="flex min-w-0 flex-col">
              <span className="text-13 truncate text-primary">{t.name}</span>
              {t.description && (
                <span className="text-11 truncate text-tertiary">{t.description}</span>
              )}
            </div>
          </CustomMenu.MenuItem>
        ))}
      </CustomMenu>
    </div>
  );
}
