/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}

function cleanupDevelopmentServiceWorkers() {
  if (!("serviceWorker" in navigator) || import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheKeys = "caches" in window ? await window.caches.keys() : [];

      if (registrations.length === 0 && cacheKeys.length === 0) return;

      await Promise.all([
        ...registrations.map((registration) => registration.unregister()),
        ...cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)),
      ]);

      const reloadKey = "dragonfruit:dev-sw-cleaned";
      if (sessionStorage.getItem(reloadKey)) return;

      sessionStorage.setItem(reloadKey, "1");
      window.location.reload();
    })();
  });
}

registerServiceWorker();
cleanupDevelopmentServiceWorkers();

const HYDRATION_RECOVERY_PATTERNS = [
  "Hydration failed",
  "Did not expect server HTML",
  "Minified React error #418",
  "Minified React error #423",
] as const;

function isHydrationRecoveryMessage(value: unknown) {
  if (value instanceof Error) return HYDRATION_RECOVERY_PATTERNS.some((pattern) => value.message.includes(pattern));
  if (typeof value === "string") return HYDRATION_RECOVERY_PATTERNS.some((pattern) => value.includes(pattern));
  return false;
}

if (import.meta.env.PROD) {
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some(isHydrationRecoveryMessage)) return;
    originalConsoleError(...args);
  };
}

function onRecoverableError(error: unknown) {
  if (isHydrationRecoveryMessage(error)) return;

  console.error(error);
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    { onRecoverableError }
  );
});
