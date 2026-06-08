/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Suspense } from "react";
import { useTheme } from "next-themes";
import { SWRConfig } from "swr";
import { IconContext } from "@phosphor-icons/react";
// DragonFruit Imports
import { WEB_SWR_CONFIG } from "@plane/constants";
import { TranslationProvider } from "@plane/i18n";
import { Toast } from "@plane/propel/toast";
// helpers
import { resolveGeneralTheme } from "@plane/utils";
import { MobileAppInstallPrompt } from "@/components/pwa/mobile-app-install-prompt";
import AppProgressBar from "@/lib/b-progress/AppProgressBar";
// mobx store provider
import { StoreProvider } from "@/lib/store-context";
import InstanceWrapper from "@/lib/wrappers/instance-wrapper";
import StoreWrapper from "@/lib/wrappers/store-wrapper";

const PHOSPHOR_ICON_CONTEXT_VALUE = { weight: "regular", size: "1em" } as const;

export interface IAppProvider {
  children: React.ReactNode;
}

export function AppProvider(props: IAppProvider) {
  const { children } = props;
  // themes
  const { resolvedTheme } = useTheme();

  return (
    <IconContext.Provider value={PHOSPHOR_ICON_CONTEXT_VALUE}>
      <StoreProvider>
        <>
          <AppProgressBar />
          <TranslationProvider>
            <Toast theme={resolveGeneralTheme(resolvedTheme)} />
            <MobileAppInstallPrompt />
            <StoreWrapper>
              <InstanceWrapper>
                <Suspense>
                  <SWRConfig value={WEB_SWR_CONFIG}>{children}</SWRConfig>
                </Suspense>
              </InstanceWrapper>
            </StoreWrapper>
          </TranslationProvider>
        </>
      </StoreProvider>
    </IconContext.Provider>
  );
}
