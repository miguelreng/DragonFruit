/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams, useRouter } from "next/navigation";
// plane imports
import { isValidNextPath } from "@plane/utils";
// components
import { UserLoggedIn } from "@/components/account/user-logged-in";
import { LogoSpinner } from "@/components/common/logo-spinner";
import { AuthView } from "@/components/views";
// hooks
import { useUser } from "@/hooks/store/use-user";
import type { Route } from "./+types/page";

export const headers: Route.HeadersFunction = () => ({
  "X-Frame-Options": "SAMEORIGIN",
});

const HomePage = observer(function HomePage() {
  const { data: currentUser, isAuthenticated, isInitializing } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const nextPath = searchParams.get("next_path");
  const isNativeCallback = Boolean(nextPath && /^dragonfruitmini:\/\/.+/i.test(nextPath));
  const nativeCallbackUrl = useMemo(() => (isNativeCallback && nextPath ? nextPath : ""), [isNativeCallback, nextPath]);
  const [nativeRedirectAttempted, setNativeRedirectAttempted] = useState(false);

  useEffect(() => {
    if (currentUser && isAuthenticated && nextPath) {
      if (isNativeCallback && nativeCallbackUrl) {
        setNativeRedirectAttempted(true);
        window.location.assign(nativeCallbackUrl);
        return;
      }
      if (isValidNextPath(nextPath)) {
        router.replace(nextPath);
      }
    }
  }, [currentUser, isAuthenticated, isNativeCallback, nativeCallbackUrl, nextPath, router]);

  if (isInitializing)
    return (
      <div className="flex h-screen min-h-[500px] w-full items-center justify-center bg-surface-1">
        <LogoSpinner />
      </div>
    );

  if (currentUser && isAuthenticated) {
    if (isNativeCallback && nativeCallbackUrl) {
      return (
        <div className="flex h-screen min-h-[500px] w-full items-center justify-center bg-surface-1 px-4">
          <div className="border-custom-border-100 bg-custom-background-90 flex max-w-md flex-col items-center gap-3 rounded-md border p-5 text-center">
            <LogoSpinner />
            <h3 className="text-base text-custom-text-100 font-semibold">Redirecting to DragonFruit Mini...</h3>
            <p className="text-sm text-custom-text-300">
              {nativeRedirectAttempted
                ? "We attempted to open the mini app."
                : "Preparing secure handoff to the mini app."}
            </p>
            <p className="text-custom-text-400 text-xs break-all">{nativeCallbackUrl}</p>
            <button
              type="button"
              className="bg-custom-primary-100 text-sm rounded-md px-4 py-2 font-medium text-white hover:opacity-90"
              onClick={() => {
                setNativeRedirectAttempted(true);
                window.location.assign(nativeCallbackUrl);
              }}
            >
              Open DragonFruit Mini
            </button>
          </div>
        </div>
      );
    }
    if (nextPath && isValidNextPath(nextPath)) {
      return (
        <div className="flex h-screen min-h-[500px] w-full items-center justify-center bg-surface-1">
          <LogoSpinner />
        </div>
      );
    }
    return <UserLoggedIn />;
  }

  return <AuthView />;
});

export default HomePage;
