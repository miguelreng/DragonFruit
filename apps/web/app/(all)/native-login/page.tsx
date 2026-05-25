/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { API_BASE_URL } from "@plane/constants";

export default function NativeLoginPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const callback = searchParams.get("callback");
    if (!callback) {
      setError("Missing native login callback.");
      return;
    }

    const url = new URL(`${API_BASE_URL}/auth/native/start/`);
    url.searchParams.set("callback", callback);
    window.location.assign(url.toString());
  }, [searchParams]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-canvas">
      <div className="max-w-md text-center">
        {error ? (
          <>
            <div className="text-base font-medium text-danger-primary">Connection failed</div>
            <div className="text-sm mt-1 text-tertiary">{error}</div>
          </>
        ) : (
          <div className="text-sm text-tertiary">Connecting DragonFruit…</div>
        )}
      </div>
    </div>
  );
}
