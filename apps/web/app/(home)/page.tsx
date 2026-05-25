/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { AuthBase } from "@/components/auth-screens/auth-base";
import { PageHead } from "@/components/core/page-title";
// helpers
import { EAuthModes, EPageTypes } from "@/helpers/authentication.helper";
// layouts
import DefaultLayout from "@/layouts/default-layout";
// wrappers
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";

function HomePage() {
  return (
    <>
      <PageHead title="Sign in to Dragon Fruit" />
      <DefaultLayout>
        <AuthenticationWrapper pageType={EPageTypes.NON_AUTHENTICATED}>
          <AuthBase authType={EAuthModes.SIGN_IN} />
        </AuthenticationWrapper>
      </DefaultLayout>
    </>
  );
}

export default HomePage;
