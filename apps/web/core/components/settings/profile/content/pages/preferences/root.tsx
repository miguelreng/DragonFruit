/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// hooks
import { useUserProfile } from "@/hooks/store/user";
// local imports
import { ProfileSettingsDefaultPreferencesList } from "./default-list";
import { ProfileSettingsLanguageAndTimezonePreferencesList } from "./language-and-timezone-list";

export const PreferencesProfileSettings = observer(function PreferencesProfileSettings() {
  const { t } = useTranslation();
  // hooks
  const { data: userProfile } = useUserProfile();

  if (!userProfile) return null;

  return (
    <div className="flex w-full flex-col gap-y-7">
      <section>
        <ProfileSettingsDefaultPreferencesList />
      </section>
      <section className="flex flex-col gap-y-3">
        <div className="text-h6-medium text-primary">{t("language_and_time")}</div>
        <ProfileSettingsLanguageAndTimezonePreferencesList />
      </section>
    </div>
  );
});
