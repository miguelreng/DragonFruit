/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ISSUE_LAYOUTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { getButtonStyling } from "@plane/propel/button";
import { ChevronDownIcon } from "@/components/icons/propel-shim";
import { EIssueLayoutTypes } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { IssueLayoutIcon } from "../../layout-icon";

export function MobileLayoutSelection({
  layouts,
  onChange,
  activeLayout,
}: {
  layouts: EIssueLayoutTypes[];
  onChange: (layout: EIssueLayoutTypes) => void;
  activeLayout?: EIssueLayoutTypes;
  isMobile?: boolean;
}) {
  const { t } = useTranslation();
  const selectedLayout = activeLayout ?? layouts[0] ?? EIssueLayoutTypes.LIST;
  const orderedLayouts = layouts.flatMap((layoutKey) => {
    const layout = ISSUE_LAYOUTS.find((item) => item.key === layoutKey);
    return layout ? [layout] : [];
  });
  return (
    <CustomMenu
      maxHeight={"md"}
      className="flex flex-grow justify-center text-13 text-secondary"
      placement="bottom-start"
      customButton={
        <>
          <IssueLayoutIcon layout={selectedLayout} size={14} strokeWidth={2} className={`h-3.5 w-3.5`} />
          <ChevronDownIcon className="my-auto size-3 text-secondary" strokeWidth={2} />
        </>
      }
      customButtonClassName={`${getButtonStyling("secondary", "base")} relative flex-grow px-2 text-13`}
      closeOnSelect
    >
      {orderedLayouts.map((layout) => (
        <CustomMenu.MenuItem
          key={layout.key}
          onClick={() => {
            onChange(layout.key);
          }}
          className="flex items-center gap-2"
        >
          <IssueLayoutIcon layout={layout.key} className="h-3 w-3" />
          <div className="text-tertiary">{t(layout.i18n_label)}</div>
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
}
