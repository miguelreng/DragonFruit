/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import { GithubIcon, HelpCircle, User } from "@/components/icons/lucide-shim";
import { useTranslation } from "@plane/i18n";
import { PageIcon } from "@/components/icons/propel-shim";
// ui
import { CustomMenu } from "@plane/ui";
// components
import { ProductUpdatesModal } from "@/components/global";
import { AppSidebarItem } from "@/components/sidebar/sidebar-item";
// hooks
import { usePowerK } from "@/hooks/store/use-power-k";
import { useTopBarTheme } from "@/hooks/use-top-bar-theme";
// plane web components
import { PlaneVersionNumber } from "@/plane-web/components/global";

type THelpMenuRootProps = {
  showLabel?: boolean;
  isInline?: boolean;
};

export const HelpMenuRoot = observer(function HelpMenuRoot(props: THelpMenuRootProps) {
  const { showLabel = true, isInline = false } = props;
  // store hooks
  const { t } = useTranslation();
  const { toggleShortcutsListModal } = usePowerK();
  // top bar theme — menu matches the frame
  const topBarTheme = useTopBarTheme();
  // states
  const [isNeedHelpOpen, setIsNeedHelpOpen] = useState(false);
  const [isProductUpdatesModalOpen, setProductUpdatesModalOpen] = useState(false);

  return (
    <>
      <ProductUpdatesModal isOpen={isProductUpdatesModalOpen} handleClose={() => setProductUpdatesModalOpen(false)} />

      <CustomMenu
        customButton={
          <AppSidebarItem
            variant="static"
            item={{
              label: "Help",
              icon: <HelpCircle className="size-5" />,
              isActive: isNeedHelpOpen,
              isInline,
              showLabel,
            }}
          />
        }
        // customButtonClassName="relative grid place-items-center rounded-lg p-1.5 outline-none"
        menuButtonOnClick={() => !isNeedHelpOpen && setIsNeedHelpOpen(true)}
        onMenuClose={() => setIsNeedHelpOpen(false)}
        placement="bottom-end"
        maxHeight="lg"
        panelDataTheme={topBarTheme}
        closeOnSelect
      >
        <CustomMenu.MenuItem onClick={() => window.open("https://github.com/miguelreng/DragonFruit#readme", "_blank")}>
          <div className="flex items-center gap-x-2 rounded-lg text-11">
            <PageIcon className="h-3.5 w-3.5 text-secondary" height={14} width={14} />
            <span className="text-11">{t("documentation")}</span>
          </div>
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem onClick={() => window.open("mailto:miguelreng@gmail.com", "_blank")}>
          <div className="flex items-center gap-x-2 rounded-lg text-11">
            <User className="h-3.5 w-3.5 text-secondary" size={14} />
            <span className="text-11">Contact</span>
          </div>
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem
          onClick={() => window.open("https://github.com/miguelreng/DragonFruit", "_blank", "noopener,noreferrer")}
        >
          <div className="flex items-center gap-x-2 rounded-lg text-11">
            <GithubIcon className="h-3.5 w-3.5 text-secondary" size={14} />
            <span className="text-11">Source code (AGPL-3.0)</span>
          </div>
        </CustomMenu.MenuItem>
        <div className="my-1 border-t border-subtle" />
        <CustomMenu.MenuItem>
          <button
            type="button"
            onClick={() => toggleShortcutsListModal(true)}
            className="justify-sbg-layer-211 flex w-full items-center hover:bg-layer-1"
          >
            <span className="text-11">{t("keyboard_shortcuts")}</span>
          </button>
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem>
          <button
            type="button"
            onClick={() => setProductUpdatesModalOpen(true)}
            className="justify-sbg-layer-211 flex w-full items-center hover:bg-layer-1"
          >
            <span className="text-11">{t("whats_new")}</span>
          </button>
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem
          onClick={() =>
            window.open("https://github.com/miguelreng/DragonFruit/discussions", "_blank", "noopener,noreferrer")
          }
        >
          <div className="flex items-center gap-x-2 rounded-lg text-11">
            <span className="text-11">Community</span>
          </div>
        </CustomMenu.MenuItem>
        <div className="mt-1 border-t border-subtle px-1 pt-2 text-11 text-secondary">
          <PlaneVersionNumber />
        </div>
      </CustomMenu>
    </>
  );
});
