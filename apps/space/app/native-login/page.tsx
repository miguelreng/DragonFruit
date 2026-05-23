/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
// plane imports
import { API_BASE_URL } from "@plane/constants";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import type { Route } from "./+types/page";

export const headers: Route.HeadersFunction = () => ({
  "X-Frame-Options": "SAMEORIGIN",
});

const DEFAULT_CALLBACK = "dragonfruitmini://auth/login-callback";

export default function NativeLoginPage() {
  const searchParams = useSearchParams();
  const callbackParam = searchParams.get("callback") || DEFAULT_CALLBACK;
  const callback = useMemo(() => {
    try {
      return decodeURIComponent(callbackParam);
    } catch {
      return callbackParam;
    }
  }, [callbackParam]);
  const [attempted, setAttempted] = useState(false);
  const startUrl = useMemo(() => {
    const params = new URLSearchParams({ callback });
    return `${API_BASE_URL}/auth/native/start/?${params.toString()}`;
  }, [callback]);

  useEffect(() => {
    setAttempted(true);
    window.location.assign(startUrl);
  }, [startUrl]);

  return (
    <div className="flex h-screen min-h-[500px] w-full items-center justify-center bg-surface-1 px-4">
      <div className="border-custom-border-100 bg-custom-background-90 flex max-w-md flex-col items-center gap-3 rounded-md border p-5 text-center">
        <LogoSpinner />
        <h3 className="text-base text-custom-text-100 font-semibold">Redirecting to DragonFruit Mini...</h3>
        <p className="text-sm text-custom-text-300">
          {attempted ? "We are opening the mini app handoff." : "Preparing secure handoff."}
        </p>
        <button
          type="button"
          className="bg-custom-primary-100 text-sm rounded-md px-4 py-2 font-medium text-white hover:opacity-90"
          onClick={() => {
            setAttempted(true);
            window.location.assign(startUrl);
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
