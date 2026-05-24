/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { useLocalStorage } from "@plane/hooks";
import { IS_FAVORITE_MENU_OPEN } from "@plane/constants";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { SidebarFavoritesMenu } from "@/components/workspace/sidebar/favorites/favorites-menu";

function WorkspaceFavoritesPage() {
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  const { setValue: setFavoriteMenuOpen } = useLocalStorage<boolean>(IS_FAVORITE_MENU_OPEN, false);

  useEffect(() => {
    setFavoriteMenuOpen(true);
  }, [setFavoriteMenuOpen]);

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("favorites")}` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <ContentWrapper>
        <div className="mx-auto w-full max-w-5xl px-6 pt-6 pb-12">
          <h2 className="text-16 font-semibold text-primary">{t("favorites")}</h2>
          <div className="mt-4">
            <SidebarFavoritesMenu />
          </div>
        </div>
      </ContentWrapper>
    </>
  );
}

export default observer(WorkspaceFavoritesPage);
