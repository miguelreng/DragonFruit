/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Suspense } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
// plane imports
import { PROFILE_SETTINGS_TABS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProfileSettingsTabs } from "@plane/types";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { PROFILE_SETTINGS_PAGES_MAP } from "@/components/settings/profile/content/pages";
// hooks
import { useUser } from "@/hooks/store/user";
// local imports
import { AccountSettingsHeader } from "./header";

function AccountSettingsPage() {
  // params
  const { profileTabId } = useParams();
  // store hooks
  const { data: currentUser } = useUser();
  // translation
  const { t } = useTranslation();
  // derived values
  const isAValidTab = PROFILE_SETTINGS_TABS.includes(profileTabId as TProfileSettingsTabs);

  if (!currentUser || !isAValidTab)
    return (
      <div className="grid size-full place-items-center px-4">
        <LogoSpinner />
      </div>
    );

  const PageComponent = PROFILE_SETTINGS_PAGES_MAP[profileTabId as TProfileSettingsTabs];

  // Render the account page inside the shared SettingsContentWrapper so the
  // padding/margins match the workspace settings pages exactly.
  return (
    <>
      <PageHead title={`${t("profile.label")} - ${t("general_settings")}`} />
      <SettingsContentWrapper header={<AccountSettingsHeader />}>
        <Suspense>
          <PageComponent />
        </Suspense>
      </SettingsContentWrapper>
    </>
  );
}

export default observer(AccountSettingsPage);
