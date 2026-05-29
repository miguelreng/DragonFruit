/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { API_BASE_URL } from "@plane/constants";

const PRODUCTION_API_BASE_URL = "https://api.dragonfruit.sh";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getNativeLoginApiBaseUrl() {
  const configuredApiBaseUrl = trimTrailingSlash(API_BASE_URL);
  if (configuredApiBaseUrl) {
    try {
      const configuredApiOrigin = new URL(configuredApiBaseUrl, window.location.origin).origin;
      if (configuredApiOrigin !== window.location.origin) return configuredApiBaseUrl;
    } catch {
      return configuredApiBaseUrl;
    }
  }

  const { hostname, origin } = window.location;
  if (hostname === "app.dragonfruit.sh" || hostname.endsWith(".vercel.app")) return PRODUCTION_API_BASE_URL;

  return configuredApiBaseUrl || origin;
}

function extractApiToken(url: string) {
  try {
    return new URL(url).searchParams.get("api_token") || "";
  } catch {
    return "";
  }
}

function extractApiTokenFromHtml(html: string) {
  const decodedHtml = html
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  const callbackMatch = decodedHtml.match(
    /(?:https:\/\/[^"'<>\s]+\.chromiumapp\.org|dragonfruitmini:\/\/)[^"'<>\s]*api_token=[^"'<>\s]+/
  );
  return callbackMatch ? extractApiToken(callbackMatch[0]) : "";
}

// Send the user through the normal web sign-in and return here afterwards so the
// extension handoff can complete once a session exists. `relogin=1` marks the
// return trip so a session that still can't mint a token shows an error instead
// of bouncing back to login forever.
function redirectToWebLogin(callback: string) {
  const returnPath = `/native-login?relogin=1&callback=${encodeURIComponent(callback)}`;
  const loginUrl = new URL("/", window.location.origin);
  loginUrl.searchParams.set("next_path", returnPath);
  window.location.assign(loginUrl.toString());
}

export default function NativeLoginPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const callback = searchParams.get("callback");
    const hasAttemptedLogin = searchParams.get("relogin") === "1";
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

        const apiBaseUrl = getNativeLoginApiBaseUrl();

        if (!isChromeExtensionCallback) {
          const url = new URL(`${apiBaseUrl}/auth/native/start/`);
          url.searchParams.set("callback", callback);
          window.location.assign(url.toString());
          return;
        }

        const url = new URL(`${apiBaseUrl}/auth/native/start/`);
        url.searchParams.set("format", "json");
        url.searchParams.set("callback", callback);
        const response = await fetch(url.toString(), {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        // A logged-out session makes the API redirect this fetch to the web
        // sign-in page rather than returning a token. Send the user through the
        // normal login and come back here to finish the handoff.
        if (response.redirected || response.status === 401 || response.status === 403) {
          if (hasAttemptedLogin) throw new Error("Sign in to DragonFruit, then connect the extension again.");
          redirectToWebLogin(callback);
          return;
        }
        if (!response.ok) throw new Error(`Token handoff failed: ${response.status}`);
        let apiToken = "";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const data = await response.json();
          apiToken = data?.api_token || (data?.callback ? extractApiToken(data.callback) : "");
        } else {
          apiToken = extractApiToken(response.url) || extractApiTokenFromHtml(await response.text());
        }
        if (!apiToken) {
          if (hasAttemptedLogin) throw new Error("Token handoff did not return an API token.");
          redirectToWebLogin(callback);
          return;
        }

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
            apiToken,
            appUrl: apiBaseUrl,
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
