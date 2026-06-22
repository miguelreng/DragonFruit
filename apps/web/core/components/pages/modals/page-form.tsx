/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FormEvent } from "react";
import { useState } from "react";
import type { LucideIcon } from "@/components/icons/lucide-shim";

// plane imports
import { ETabIndices, EPageAccess } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { GlobeIcon, LockIcon, PageIcon } from "@/components/icons/propel-shim";
import type { ISvgIcons } from "@/components/icons/propel-shim";
import type { TPage, TPageTemplate } from "@plane/types";
import { CustomMenu, Input } from "@plane/ui";
import { getTabIndex } from "@plane/utils";
// components
import { AccessField } from "@/components/common/access-field";
import { ChevronDown } from "@/components/icons/lucide-shim";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  formData: Partial<TPage>;
  handleFormData: <T extends keyof TPage>(key: T, value: TPage[T]) => void;
  handleModalClose: () => void;
  handleFormSubmit: () => Promise<void>;
  /** Workspace templates available to seed the new page. Empty list hides the picker. */
  templates?: TPageTemplate[];
  /** Currently picked template id, "" means start from blank. */
  selectedTemplateId?: string;
  onTemplateChange?: (templateId: string) => void;
};

const PAGE_ACCESS_SPECIFIERS: {
  key: EPageAccess;
  i18n_label: string;
  icon: LucideIcon | React.FC<ISvgIcons>;
}[] = [
  { key: EPageAccess.PUBLIC, i18n_label: "common.access.public", icon: GlobeIcon },
  { key: EPageAccess.PRIVATE, i18n_label: "common.access.private", icon: LockIcon },
];

export function PageForm(props: Props) {
  const {
    formData,
    handleFormData,
    handleModalClose,
    handleFormSubmit,
    templates,
    selectedTemplateId,
    onTemplateChange,
  } = props;
  // hooks
  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();
  // state
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const i18n_access_label = PAGE_ACCESS_SPECIFIERS.find((access) => access.key === formData.access)?.i18n_label;

  const { getIndex } = getTabIndex(ETabIndices.PROJECT_PAGE, isMobile);

  const handlePageFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await handleFormSubmit();
      setIsSubmitting(false);
    } catch {
      setIsSubmitting(false);
    }
  };

  const isTitleLengthMoreThan255Character = formData.name ? formData.name.length > 255 : false;

  return (
    <form onSubmit={handlePageFormSubmit}>
      <div className="space-y-5 p-5">
        <h3 className="text-18 font-medium text-secondary">Create page</h3>
        {templates && templates.length > 0 && onTemplateChange && (
          <div className="flex items-center gap-3">
            {/* span — visual label only, the CustomMenu trigger is a
                non-input element so there's nothing to bind htmlFor to. */}
            <span className="shrink-0 text-12 text-tertiary">Start from</span>
            {/* CustomMenu picker (replaces a native <select> for parity
                with the project create flow and the rest of the design
                system). customButton is a <div> — CustomMenu wraps it
                in its own <button> internally, so passing another
                <button> would produce invalid nested-button markup. */}
            <CustomMenu
              customButton={
                <div className="flex w-full min-w-[220px] cursor-pointer items-center justify-between rounded-lg border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary hover:bg-layer-2">
                  <span className="truncate">
                    {templates.find((template) => template.id === selectedTemplateId)?.name ?? "Blank page"}
                  </span>
                  <ChevronDown className="size-3.5 text-tertiary" />
                </div>
              }
              placement="bottom-start"
              menuItemsClassName="w-72 max-h-72 overflow-y-auto"
            >
              <CustomMenu.MenuItem onClick={() => onTemplateChange("")}>
                <div className="flex flex-col">
                  <span className="text-13 text-primary">Blank page</span>
                  <span className="text-11 text-tertiary">Start from scratch</span>
                </div>
              </CustomMenu.MenuItem>
              {templates.map((template) => (
                <CustomMenu.MenuItem key={template.id} onClick={() => onTemplateChange(template.id)}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-13 text-primary">{template.name}</span>
                    {template.description && (
                      <span className="truncate text-11 text-tertiary">{template.description}</span>
                    )}
                  </div>
                </CustomMenu.MenuItem>
              ))}
            </CustomMenu>
          </div>
        )}
        <div className="flex h-9 w-full items-start gap-2">
          <EmojiPicker
            isOpen={isOpen}
            handleToggle={(val: boolean) => setIsOpen(val)}
            className="flex-shrink0 flex items-center justify-center"
            buttonClassName="flex items-center justify-center bg-layer-2 hover:bg-layer-2-hover rounded-lg"
            label={
              <span className="grid h-9 w-9 place-items-center rounded-lg">
                <>
                  {formData?.logo_props?.in_use ? (
                    <Logo logo={formData?.logo_props} size={18} type="lucide" />
                  ) : (
                    <PageIcon className="h-4 w-4 text-tertiary" />
                  )}
                </>
              </span>
            }
            onChange={(val: any) => {
              let logoValue = {};

              if (val?.type === "emoji")
                logoValue = {
                  value: val.value,
                  url: undefined,
                };
              else if (val?.type === "icon") logoValue = val.value;

              handleFormData("logo_props", {
                in_use: val?.type,
                [val?.type]: logoValue,
              });
              setIsOpen(false);
            }}
            defaultIconColor={
              formData?.logo_props?.in_use && formData?.logo_props?.in_use === "icon"
                ? formData?.logo_props?.icon?.color
                : undefined
            }
            defaultOpen={
              formData?.logo_props?.in_use && formData?.logo_props?.in_use === "emoji"
                ? EmojiIconPickerTypes.EMOJI
                : EmojiIconPickerTypes.ICON
            }
          />
          <div className="flew-grow w-full space-y-1">
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleFormData("name", e.target.value)}
              placeholder="Title"
              className="w-full resize-none text-14"
              tabIndex={getIndex("name")}
              required
            />
            {isTitleLengthMoreThan255Character && (
              <span className="text-11 text-danger-primary">
                Max length of the name should be less than 255 characters
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <div className="flex items-center gap-2">
          <AccessField
            onChange={(access) => handleFormData("access", access)}
            value={formData?.access ?? EPageAccess.PRIVATE}
            accessSpecifiers={PAGE_ACCESS_SPECIFIERS}
            isMobile={isMobile}
          />
          <h6 className="text-11 font-medium">{t(i18n_access_label || "")}</h6>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleModalClose} tabIndex={getIndex("cancel")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="submit"
            loading={isSubmitting}
            disabled={isTitleLengthMoreThan255Character}
            tabIndex={getIndex("submit")}
          >
            {isSubmitting ? "Creating" : "Create Page"}
          </Button>
        </div>
      </div>
    </form>
  );
}
