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

    (async () => {
      try {
        const callbackUrl = new URL(callback);
        const extensionId = callbackUrl.hostname.split(".")[0];
        const isChromeExtensionCallback =
          callbackUrl.protocol === "https:" && callbackUrl.hostname.endsWith(".chromiumapp.org") && extensionId;

        if (!isChromeExtensionCallback) {
          const url = new URL(`${API_BASE_URL}/auth/native/start/`);
          url.searchParams.set("callback", callback);
          window.location.assign(url.toString());
          return;
        }

        const url = new URL(`${API_BASE_URL}/auth/native/start/`);
        url.searchParams.set("format", "json");
        url.searchParams.set("callback", callback);
        const response = await fetch(url.toString(), {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Token handoff failed: ${response.status}`);
        const data = await response.json();
        if (!data?.api_token) throw new Error("Token handoff did not return an API token.");

        const chromeRuntime = (
          window as unknown as {
            chrome?: {
              runtime?: {
                lastError?: { message?: string };
                sendMessage: (
                  extensionId: string,
                  message: Record<string, unknown>,
                  callback: (reply?: { ok?: boolean; error?: string }) => void
                ) => void;
              };
            };
          }
        ).chrome?.runtime;
        if (!chromeRuntime?.sendMessage) throw new Error("Chrome extension messaging is unavailable.");

        chromeRuntime.sendMessage(
          extensionId,
          {
            type: "DRAGONFRUIT_NATIVE_TOKEN",
            apiToken: data.api_token,
            appUrl: API_BASE_URL,
          },
          (reply) => {
            const lastError = chromeRuntime.lastError;
            if (lastError || !reply?.ok) {
              setError(lastError?.message || reply?.error || "Could not send token to the extension.");
              return;
            }
            window.close();
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not connect the Chrome extension.");
      }
    })();
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
