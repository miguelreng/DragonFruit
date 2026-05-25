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

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
});
