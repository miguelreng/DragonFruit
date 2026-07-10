/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Suspense } from "react";
import { useTheme } from "next-themes";
import { SWRConfig } from "swr";
// DragonFruit Imports
import { WEB_SWR_CONFIG } from "@plane/constants";
import { TranslationProvider } from "@plane/i18n";
import { Toast } from "@plane/propel/toast";
// helpers
import { resolveGeneralTheme } from "@plane/utils";
import { AppLoadingScreen } from "@/components/common/app-loading-screen";
import { MobileAppInstallPrompt } from "@/components/pwa/mobile-app-install-prompt";
import AppProgressBar from "@/lib/b-progress/AppProgressBar";
// mobx store provider
import { StoreProvider } from "@/lib/store-context";
import InstanceWrapper from "@/lib/wrappers/instance-wrapper";
import StoreWrapper from "@/lib/wrappers/store-wrapper";

export interface IAppProvider {
  children: React.ReactNode;
}

export function AppProvider(props: IAppProvider) {
  const { children } = props;
  // themes
  const { resolvedTheme } = useTheme();

  return (
    <StoreProvider>
      <>
        <AppProgressBar />
        <TranslationProvider>
          <Toast theme={resolveGeneralTheme(resolvedTheme)} />
          <MobileAppInstallPrompt />
          <StoreWrapper>
            <InstanceWrapper>
              <Suspense fallback={<AppLoadingScreen />}>
                <SWRConfig value={WEB_SWR_CONFIG}>{children}</SWRConfig>
              </Suspense>
            </InstanceWrapper>
          </StoreWrapper>
        </TranslationProvider>
      </>
    </StoreProvider>
  );
}
