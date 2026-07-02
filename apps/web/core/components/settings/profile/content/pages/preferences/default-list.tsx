/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { CustomSelect } from "@plane/ui";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
import { ThemeSwitcher } from "@/plane-web/components/preferences/theme-switcher";
// helpers
import { DOC_FONT_STYLE_OPTIONS } from "@/helpers/doc-font";
// hooks
import { usePageFilters } from "@/hooks/use-page-filters";

const DocumentFontSwitcher = observer(function DocumentFontSwitcher() {
  const { fontStyle, handleFontStyle } = usePageFilters();
  const activeOption = DOC_FONT_STYLE_OPTIONS.find((option) => option.value === fontStyle);

  return (
    <SettingsControlItem
      title="Default document font"
      description="The font new documents open with. You can still change the font on any individual doc."
      control={
        <CustomSelect
          value={fontStyle}
          label={activeOption?.label ?? "Select a font"}
          onChange={handleFontStyle}
          buttonClassName="border border-subtle-1"
          className="rounded-lg"
          input
          placement="bottom-end"
        >
          {DOC_FONT_STYLE_OPTIONS.map((option) => (
            <CustomSelect.Option key={option.value} value={option.value}>
              {option.label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      }
    />
  );
});

export const ProfileSettingsDefaultPreferencesList = observer(function ProfileSettingsDefaultPreferencesList() {
  return (
    <div className="flex flex-col gap-y-1">
      <ThemeSwitcher
        option={{
          id: "theme",
          title: "theme",
          description: "select_or_customize_your_interface_color_scheme",
        }}
      />
      <DocumentFontSwitcher />
    </div>
  );
});
