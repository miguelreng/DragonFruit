/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ChangeEvent } from "react";
import { useState } from "react";
import type { UseFormSetValue } from "react-hook-form";
import { Controller, useFormContext } from "react-hook-form";
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import type { IProject } from "@plane/types";
import { Input, TextArea, ToggleSwitch } from "@plane/ui";
import { projectIdentifierSanitizer, getTabIndex } from "@plane/utils";
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  setValue: UseFormSetValue<TProject>;
  isMobile: boolean;
  shouldAutoSyncIdentifier: boolean;
  setShouldAutoSyncIdentifier: (value: boolean) => void;
  handleFormOnChange?: () => void;
};

function ProjectCommonAttributes(props: Props) {
  const { setValue, isMobile, shouldAutoSyncIdentifier, handleFormOnChange } = props;
  const {
    formState: { errors },
    control,
  } = useFormContext<TProject>();
  const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);
  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  const { t } = useTranslation();

  const handleNameChange =
    (onChange: (event: ChangeEvent<HTMLInputElement>) => void) => (e: ChangeEvent<HTMLInputElement>) => {
      if (!shouldAutoSyncIdentifier) {
        onChange(e);
        return;
      }
      if (e.target.value === "") setValue("identifier", "");
      else setValue("identifier", projectIdentifierSanitizer(e.target.value).substring(0, 10));
      onChange(e);
      handleFormOnChange?.();
    };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-body-sm-medium text-primary">{t("icon_and_name")}</label>
        <div className="flex items-stretch gap-2">
          <Controller
            name="logo_props"
            control={control}
            render={({ field: { value, onChange } }) => (
              <EmojiPicker
                iconType="material"
                isOpen={isLogoPickerOpen}
                handleToggle={(val: boolean) => setIsLogoPickerOpen(val)}
                className="flex items-center justify-center"
                buttonClassName="flex items-center justify-center"
                label={
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-subtle bg-layer-2">
                    <Logo logo={value} size={16} />
                  </span>
                }
                onChange={(val: any) => {
                  let logoValue = {};
                  if (val?.type === "emoji") logoValue = { value: val.value };
                  else if (val?.type === "icon") logoValue = val.value;

                  const newLogoProps = {
                    in_use: val?.type,
                    [val?.type]: logoValue,
                  };
                  setValue("logo_props", newLogoProps, { shouldDirty: true });
                  onChange(newLogoProps);
                  handleFormOnChange?.();
                  setIsLogoPickerOpen(false);
                }}
                defaultIconColor={value?.in_use && value.in_use === "icon" ? value.icon?.color : undefined}
                defaultOpen={
                  value?.in_use && value.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON
                }
              />
            )}
          />
          <div className="flex-1">
            <Controller
              control={control}
              name="name"
              rules={{
                required: t("name_is_required"),
                maxLength: {
                  value: 255,
                  message: t("title_should_be_less_than_255_characters"),
                },
              }}
              render={({ field: { value, onChange } }) => (
                <Input
                  id="name"
                  name="name"
                  type="text"
                  value={value}
                  onChange={handleNameChange(onChange)}
                  hasError={Boolean(errors.name)}
                  placeholder={t("e_g_marketing_engineering_hr")}
                  className="w-full"
                  tabIndex={getIndex("name")}
                  autoFocus
                />
              )}
            />
            {errors?.name?.message && (
              <span className="mt-1 block text-11 text-danger-primary">{errors.name.message}</span>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-body-sm-medium text-primary">
          Brief <span className="text-secondary">({t("optional")})</span>
        </label>
        <Controller
          name="description"
          control={control}
          render={({ field: { value, onChange } }) => (
            <TextArea
              id="description"
              name="description"
              value={value}
              placeholder=""
              onChange={(e) => {
                onChange(e);
                handleFormOnChange?.();
              }}
              className="!h-20 w-full text-13"
              hasError={Boolean(errors?.description)}
              tabIndex={getIndex("description")}
            />
          )}
        />
      </div>

      <Controller
        control={control}
        name="network"
        render={({ field: { value, onChange } }) => (
          <div className="flex items-center justify-between pt-1">
            <div>
              <div className="text-body-sm-medium text-primary">{t("make_private")}</div>
              <div className="text-caption-md-regular text-secondary">{t("make_private_description")}</div>
            </div>
            <ToggleSwitch
              value={value === 0}
              onChange={(checked) => {
                onChange(checked ? 0 : 2);
                handleFormOnChange?.();
              }}
            />
          </div>
        )}
      />
    </div>
  );
}

export default ProjectCommonAttributes;
