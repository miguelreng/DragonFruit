/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { DownloadSimple, X } from "@phosphor-icons/react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "dragonfruit-mobile-install-dismissed-v1";

function isStandaloneApp() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches;
}

export function MobileAppInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isStandaloneApp() || window.localStorage.getItem(DISMISSED_KEY) === "1") return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      setInstallEvent(promptEvent);
      setIsVisible(isMobileViewport());
    };

    const handleResize = () => {
      setIsVisible((current) => current && isMobileViewport());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  if (!installEvent || !isVisible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setIsVisible(false);
  };

  const install = async () => {
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
      dismiss();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden">
      <div className="pointer-events-auto mx-auto flex max-w-sm items-center gap-3 rounded-lg border border-subtle bg-surface-1 p-3 shadow-raised-200">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-primary text-on-color">
          <DownloadSimple size={18} weight="bold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-13 font-medium text-primary">Install Dragon Fruit</div>
          <div className="truncate text-12 text-secondary">Open from your home screen.</div>
        </div>
        <button
          type="button"
          className="h-9 shrink-0 rounded-lg bg-accent-primary px-3 text-12 font-medium text-on-color"
          onClick={install}
        >
          Install
        </button>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-secondary hover:bg-surface-2 hover:text-primary"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
