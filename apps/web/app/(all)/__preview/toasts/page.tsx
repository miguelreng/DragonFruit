/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Notification source-of-truth preview.
 *
 * Route: /__preview/toasts
 */

import type { ReactNode } from "react";
import { Button } from "@plane/propel/button";
import { ToastStatic, setPromiseToast, setToast, TOAST_TYPE, updateToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";

const NOTIFICATION_SPEC = [
  ["Width", "360px"],
  ["Corner radius", "16px"],
  ["Placement", "Top right, 12px inset"],
  ["Icon", "22px filled status badge"],
  ["Content", "14px title, 13px message"],
  ["CTA", "Quiet bordered pill"],
  ["Close", "Top-right hover control"],
] as const;

const WEB_EXAMPLES = [
  {
    type: TOAST_TYPE.SUCCESS,
    title: "Action created",
    message: "Open it in Atlas when you are ready.",
    action: "View",
  },
  {
    type: TOAST_TYPE.INFO,
    title: "Meeting starts soon",
    message: "Design sync begins in 5 minutes.",
    action: "Join",
  },
  {
    type: TOAST_TYPE.WARNING,
    title: "Recording paused",
    message: "Audio input is temporarily unavailable.",
  },
  {
    type: TOAST_TYPE.ERROR,
    title: "Could not create action",
    message: "Check your connection and try again.",
  },
  {
    type: TOAST_TYPE.LOADING,
    title: "Creating action...",
  },
] as const;

const CHROME_EXAMPLES = [
  {
    state: "success",
    title: "Added to Atlas",
    message: "This page was saved as an action.",
    action: "View",
  },
  {
    state: "loading",
    title: "Creating action...",
    message: "",
  },
  {
    state: "error",
    title: "Connect your DragonFruit account",
    message: "Sign in before saving from Chrome.",
  },
] as const;

function fakeRequest(ms: number, shouldReject = false) {
  return new Promise<{ name: string }>((resolve, reject) => {
    setTimeout(() => {
      if (shouldReject) {
        reject(new Error("failed"));
        return;
      }
      resolve({ name: "Action" });
    }, ms);
  });
}

const LIVE_TRIGGERS: { label: string; run: () => void }[] = [
  {
    label: "Success",
    run: () =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Action created",
        message: "Open it in Atlas when you are ready.",
      }),
  },
  {
    label: "Meeting",
    run: () =>
      setToast({
        type: TOAST_TYPE.INFO,
        title: "Meeting starts soon",
        message: "Design sync begins in 5 minutes.",
        actionItems: <button type="button">Join</button>,
      }),
  },
  {
    label: "Error",
    run: () =>
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not create action",
        message: "Check your connection and try again.",
      }),
  },
  {
    label: "Loading",
    run: () => setToast({ type: TOAST_TYPE.LOADING, title: "Creating action..." }),
  },
  {
    label: "With CTA",
    run: () =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Added to Atlas",
        message: "This page was saved as an action.",
        actionItems: <button type="button">View</button>,
      }),
  },
];

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-body-sm-semibold text-primary">{title}</h2>
        {subtitle && <p className="max-w-[72ch] text-body-xs-regular text-tertiary">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function SpecList() {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {NOTIFICATION_SPEC.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-subtle bg-surface-1 px-3 py-2">
          <div className="text-[11px] leading-4 font-medium text-placeholder">{label}</div>
          <div className="text-body-xs-medium text-secondary">{value}</div>
        </div>
      ))}
    </div>
  );
}

function WebToastColumn({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-theme={theme} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-body-xs-medium text-placeholder capitalize">{theme}</span>
        <span className="text-[11px] font-medium text-tertiary">Web app</span>
      </div>
      <div className="flex flex-col gap-3">
        {WEB_EXAMPLES.map((example) => (
          <ToastStatic
            key={`${theme}-${example.title}`}
            theme={theme}
            type={example.type}
            title={example.title}
            message={"message" in example ? example.message : undefined}
            actionItems={"action" in example ? <button type="button">{example.action}</button> : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ChromeStatusIcon({ state }: { state: "success" | "loading" | "error" }) {
  if (state === "loading") {
    return (
      <svg className="size-[22px] shrink-0 text-tertiary" viewBox="0 0 24 24" aria-hidden="true">
        <g>
          <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.14" />
          <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.29" transform="rotate(30 12 12)" />
          <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.43" transform="rotate(60 12 12)" />
          <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.57" transform="rotate(90 12 12)" />
          <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.71" transform="rotate(120 12 12)" />
          <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.86" transform="rotate(150 12 12)" />
          <rect width="2" height="5" x="11" y="1" fill="currentColor" transform="rotate(180 12 12)" />
          <animateTransform
            attributeName="transform"
            calcMode="discrete"
            dur="0.75s"
            repeatCount="indefinite"
            type="rotate"
            values="0 12 12;30 12 12;60 12 12;90 12 12;120 12 12;150 12 12;180 12 12;210 12 12;240 12 12;270 12 12;300 12 12;330 12 12;360 12 12"
          />
        </g>
      </svg>
    );
  }

  return (
    <svg
      className="size-[22px] shrink-0 text-white"
      viewBox="0 0 24 24"
      fill={state === "success" ? "var(--bg-success-primary)" : "var(--bg-danger-primary)"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {state === "success" ? (
        <>
          <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
          <path d="m9 12 2 2 4-4" fill="none" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </>
      )}
    </svg>
  );
}

function ChromeExtensionToast({
  title,
  message,
  state,
  action,
  theme,
}: {
  title: string;
  message?: string;
  state: "success" | "loading" | "error";
  action?: string;
  theme: "light" | "dark";
}) {
  return (
    <div data-theme={theme} className="w-[360px] max-w-full">
      <div
        className={cn(
          "group relative flex h-[68px] w-full items-center gap-3 overflow-hidden rounded-2xl border border-subtle-1 bg-surface-1",
          "px-3.5 py-3.5 pr-9 shadow-overlay-200"
        )}
      >
        <ChromeStatusIcon state={state} />
        <div className="min-w-0 flex-1">
          <div className="text-body-sm-semibold text-primary">{title}</div>
          {message && <div className="truncate text-body-xs-regular text-tertiary">{message}</div>}
        </div>
        {action && (
          <button
            type="button"
            className="inline-flex shrink-0 items-center rounded-full border border-subtle bg-surface-2 px-3 py-1 text-body-xs-medium text-secondary transition-colors hover:border-subtle-1 hover:text-primary"
          >
            {action}
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          className="absolute top-2.5 right-2.5 grid size-[18px] place-items-center text-icon-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:text-icon-secondary"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ChromeColumn({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-theme={theme} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-body-xs-medium text-placeholder capitalize">{theme}</span>
        <span className="text-[11px] font-medium text-tertiary">Chrome extension</span>
      </div>
      <div className="flex flex-col gap-3">
        {CHROME_EXAMPLES.map((example) => (
          <ChromeExtensionToast key={`${theme}-${example.title}`} theme={theme} {...example} />
        ))}
      </div>
    </div>
  );
}

function ComparisonBand({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 rounded-xl border border-subtle bg-surface-1 p-5 lg:grid-cols-2">
      {children}
    </div>
  );
}

export default function ToastPreviewPage() {
  const triggerPromise = () =>
    setPromiseToast(fakeRequest(2200), {
      loading: "Creating action...",
      success: {
        title: "Action created",
        message: (data) => `${data.name} is ready.`,
        actionItems: () => <button type="button">View</button>,
      },
      error: { title: "Action failed", message: () => "Please try again." },
    });

  const triggerUpdate = () => {
    const id = setToast({ type: TOAST_TYPE.LOADING, title: "Listening..." });
    if (typeof id !== "string") return;

    setTimeout(() => {
      updateToast(id, {
        type: TOAST_TYPE.SUCCESS,
        title: "Action captured",
        message: "Atlas turned your note into a task.",
        actionItems: <button type="button">View</button>,
      });
    }, 2200);
  };

  return (
    <div className="min-h-screen bg-surface-2 px-6 py-10">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-10">
        <header className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-placeholder">Dev preview</span>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-primary">Notification source of truth</h1>
            <p className="max-w-[76ch] text-body-sm-regular text-tertiary">
              Web app and Chrome extension notification states in one place. Use this page to tune the canonical toast
              shape, spacing, CTA treatment, and light/dark behavior before applying the same decisions elsewhere.
            </p>
          </div>
        </header>

        <Section title="Contract">
          <SpecList />
        </Section>

        <Section
          title="Live web toast"
          subtitle="These buttons fire the actual web app toast manager into the top-right viewport."
        >
          <div className="flex flex-wrap gap-2">
            {LIVE_TRIGGERS.map((trigger) => (
              <Button key={trigger.label} variant="secondary" size="sm" onClick={trigger.run}>
                {trigger.label}
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={triggerPromise}>
              Promise
            </Button>
            <Button variant="secondary" size="sm" onClick={triggerUpdate}>
              Listening to success
            </Button>
          </div>
        </Section>

        <Section title="Web app" subtitle="Static states rendered by the shared `@plane/propel/toast` component.">
          <ComparisonBand>
            <WebToastColumn theme="light" />
            <WebToastColumn theme="dark" />
          </ComparisonBand>
        </Section>

        <Section
          title="Chrome extension"
          subtitle="Static replica of the injected toast in `apps/chrome-extension/src/background.js`."
        >
          <ComparisonBand>
            <ChromeColumn theme="light" />
            <ChromeColumn theme="dark" />
          </ComparisonBand>
        </Section>
      </div>
    </div>
  );
}
