/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { Toast as BaseToast } from "@base-ui-components/react/toast";
// spinner
import { CircularBarSpinner } from "../spinners/circular-bar-spinner";
import { cn } from "../utils/classname";

export enum TOAST_TYPE {
  SUCCESS = "success",
  CURSOR_BUDDY_SUCCESS = "cursor-buddy-success",
  ERROR = "error",
  INFO = "info",
  WARNING = "warning",
  LOADING = "loading",
  LOADING_TOAST = "loading-toast",
}

type SetToastProps =
  | {
      type: TOAST_TYPE.LOADING;
      title?: string;
    }
  | {
      id?: string | number;
      type: Exclude<TOAST_TYPE, TOAST_TYPE.LOADING>;
      title: string;
      message?: string;
      actionItems?: React.ReactNode;
    };

type PromiseToastCallback<ToastData> = (data: ToastData) => string;
type ActionItemsPromiseToastCallback<ToastData> = (data: ToastData) => React.ReactNode;

type PromiseToastData<ToastData> = {
  title: string;
  message?: PromiseToastCallback<ToastData>;
  actionItems?: ActionItemsPromiseToastCallback<ToastData>;
};

type PromiseToastOptions<ToastData> = {
  loading?: string;
  success: PromiseToastData<ToastData>;
  error: PromiseToastData<ToastData>;
};

export type ToastProps = {
  theme: "light" | "dark" | "system";
  /**
   * Time (in ms) before a toast auto-dismisses. Loading toasts always persist
   * until replaced. A value of `0` disables auto-dismiss. Defaults to a few
   * seconds so toasts clear themselves without manual dismissal.
   */
  timeout?: number;
};

const DEFAULT_TOAST_TIMEOUT = 4000;

const toastManager = BaseToast.createToastManager();

// Hover pauses auto-dismiss; the timer-resume nudges below must not break
// that, so they stand down while the pointer is on a toast.
const isAnyToastHovered = () =>
  Array.from(document.querySelectorAll(".t-toast")).some((el) => el.matches(":hover"));

// Base UI's viewport pauses auto-dismiss timers on window blur but never
// resumes them on a plain window refocus: its capture-phase focus handler
// early-returns when event.target === window, so windowFocusedRef stays false
// and every timer stays paused — after one cmd-tab away and back, current AND
// future toasts sit open forever. A body-targeted focus event passes that
// handler's target filter, so re-dispatching one drives Base UI's own resume
// path (resumeTimers + windowFocusedRef repair).
const nudgeBaseUiTimerResume = () => {
  if (isAnyToastHovered()) return;
  document.body.dispatchEvent(new FocusEvent("focus"));
};

export function Toast(props: ToastProps) {
  React.useEffect(() => {
    const handleWindowFocus = (event: FocusEvent) => {
      // Element-targeted focus events don't bubble to window listeners, so
      // this only sees true window refocus — exactly the case Base UI drops.
      if (event.target !== window) return;
      nudgeBaseUiTimerResume();
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, []);

  return (
    <BaseToast.Provider toastManager={toastManager} timeout={props.timeout ?? DEFAULT_TOAST_TIMEOUT}>
      <BaseToast.Portal>
        <BaseToast.Viewport data-theme={props.theme}>
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

// Semantic toast glyphs ported verbatim from the Atlas mac app's
// AtlasToastSemanticIcon (Lucide badge-check / circle-alert / triangle-alert /
// info) so the web toast matches the desktop app. Same rendering contract as
// the mac: the shape is filled with the semantic background token and the glyph
// knocks out white (stroke), keeping each badge correct in light and dark.
function ToastSemanticIcon({ fill, children }: { fill: string; children: React.ReactNode }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

// The main signal in the action-pill style.
const TOAST_DATA = {
  [TOAST_TYPE.SUCCESS]: {
    icon: (
      <ToastSemanticIcon fill="var(--bg-success-primary)">
        <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
        <path d="m9 12 2 2 4-4" />
      </ToastSemanticIcon>
    ),
    backgroundColorClassName: "!bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.CURSOR_BUDDY_SUCCESS]: {
    icon: (
      <ToastSemanticIcon fill="var(--bg-success-primary)">
        <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
        <path d="m9 12 2 2 4-4" />
      </ToastSemanticIcon>
    ),
    backgroundColorClassName: "!bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.ERROR]: {
    icon: (
      <ToastSemanticIcon fill="var(--bg-danger-primary)">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </ToastSemanticIcon>
    ),
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.WARNING]: {
    icon: (
      <ToastSemanticIcon fill="var(--bg-warning-primary)">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </ToastSemanticIcon>
    ),
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.INFO]: {
    icon: (
      <ToastSemanticIcon fill="var(--bg-accent-primary)">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </ToastSemanticIcon>
    ),
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.LOADING]: {
    icon: <CircularBarSpinner className="text-tertiary" />,
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.LOADING_TOAST]: {
    icon: <CircularBarSpinner className="text-tertiary" />,
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
};

// Corner-floating close button mirroring the mac app's toast close
// (ToastCloseButton): a 22px bordered circle straddling the toast's top-left
// corner, -9px from the visual corner on both axes (-10 compensates for the
// toast's 1px border shifting the absolute-positioning origin).
const TOAST_CLOSE_BUTTON = cn(
  "absolute -top-2.5 -left-2.5 flex h-[22px] w-[22px] items-center justify-center",
  "rounded-full border border-strong bg-surface-1 text-icon-secondary shadow-raised-300"
);

// Bare ✕ matching the mac app's `.cancel` glyph — propel's CloseIcon is
// Solar's circled variant, which would double-ring inside the bordered circle.
function ToastCloseGlyph() {
  return (
    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 6L6 18m12 0L6 6"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Toast actions render as a quiet "pill" by default. We only target direct
// <a>/<button> children, so simple link/button actions pick up the pill look
// automatically while richer custom action components style themselves.
const TOAST_ACTION_WRAPPER = cn(
  "flex flex-shrink-0 items-center gap-2",
  "[&>a]:inline-flex [&>a]:cursor-pointer [&>a]:items-center [&>a]:rounded-full [&>a]:border [&>a]:border-subtle [&>a]:bg-surface-2 [&>a]:px-3 [&>a]:py-1 [&>a]:text-body-xs-medium [&>a]:text-secondary [&>a]:no-underline [&>a]:transition-colors [&>a]:hover:border-subtle-1 [&>a]:hover:text-primary [&>a]:hover:no-underline",
  "[&>button]:inline-flex [&>button]:cursor-pointer [&>button]:items-center [&>button]:rounded-full [&>button]:border [&>button]:border-subtle [&>button]:bg-surface-2 [&>button]:px-3 [&>button]:py-1 [&>button]:text-body-xs-medium [&>button]:text-secondary [&>button]:transition-colors [&>button]:hover:border-subtle-1 [&>button]:hover:text-primary"
);

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  const hasToasts = toasts.length > 0;

  // A toast added while windowFocusedRef is stale-false starts pre-paused even
  // though the window is focused (the ref only heals on a qualifying focus
  // event, which may never come). Nudge Base UI's resume path once its
  // viewport effect has attached the focus listeners — this effect runs before
  // the viewport's (child before parent), so defer past the effect flush.
  React.useEffect(() => {
    if (!hasToasts) return undefined;
    const timerId = setTimeout(() => {
      if (document.hasFocus()) nudgeBaseUiTimerResume();
    }, 0);
    return () => clearTimeout(timerId);
  }, [hasToasts]);

  return toasts.map((toast) => <ToastRender key={toast.id} id={toast.id} toast={toast} />);
}

function ToastRender({ id, toast }: { id: React.Key; toast: BaseToast.Root.ToastObject }) {
  const toastData = toast.data as SetToastProps;
  const type = toastData.type as TOAST_TYPE;
  const data = TOAST_DATA[type];

  return (
    <BaseToast.Root
      toast={toast}
      key={id}
      swipeDirection={["up", "right"]}
      className={cn(
        // Base layout and positioning — anchored to the top-right corner
        "group flex w-[360px] max-w-[calc(100vw-2rem)] items-center rounded-2xl border border-subtle-1 shadow-overlay-200",
        "absolute top-3 right-3 z-[calc(1000-var(--toast-index))]",
        "t-toast select-none",

        // Default transform: newest toast on top, older ones nudged down and scaled back
        "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+calc(min(var(--toast-index),10)*10px)))_scale(calc(max(0,1-(var(--toast-index)*0.1))))]",

        // Pseudo-element bridging the gap toward the anchor so hover doesn't drop between stacked toasts
        "after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",

        // State-based opacity
        "data-[ending-style]:opacity-0 data-[limited]:opacity-0",

        // Starting animation — slide in from above
        "data-[starting-style]:[transform:translateY(-150%)]",

        // Expanded state transform — fan downward from the top edge
        "data-[expanded]:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y)))]",

        // Swipe direction endings - consolidated
        "data-[ending-style]:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-[ending-style]:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-[ending-style]:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-[ending-style]:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",

        // Default ending transform for non-limited toasts — exit upward
        "data-[ending-style]:[&:not([data-limited])]:[transform:translateY(-150%)]",

        data.backgroundColorClassName,
        data.borderColorClassName
      )}
      style={{
        ["--gap" as string]: "1rem",
        ["--offset-y" as string]:
          "calc(var(--toast-offset-y) + (var(--toast-index) * var(--gap)) + var(--toast-swipe-movement-y))",
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <div className="flex w-full items-center gap-3 p-3.5">
        <div className="flex-shrink-0">{data.icon}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <BaseToast.Title className="text-body-sm-semibold text-primary">
            {toastData.type === TOAST_TYPE.LOADING ? (toastData.title ?? "Loading...") : toastData.title}
          </BaseToast.Title>
          {toastData.type !== TOAST_TYPE.LOADING && toastData.message && (
            <BaseToast.Description className="text-body-xs-regular text-tertiary">
              {toastData.message}
            </BaseToast.Description>
          )}
        </div>
        {toastData.type !== TOAST_TYPE.LOADING && toastData.actionItems && (
          <div className={TOAST_ACTION_WRAPPER}>{toastData.actionItems}</div>
        )}
      </div>
      <BaseToast.Close
        className={cn(
          TOAST_CLOSE_BUTTON,
          "scale-[0.6] cursor-pointer opacity-0 transition-[opacity,transform,color] duration-200 ease-out",
          "group-hover:scale-100 group-hover:opacity-100 hover:text-icon-primary"
        )}
      >
        <ToastCloseGlyph />
      </BaseToast.Close>
    </BaseToast.Root>
  );
}

// Static toast component for Storybook and documentation
export type ToastStaticProps = {
  type: TOAST_TYPE;
  title: string;
  message?: string;
  actionItems?: React.ReactNode;
  theme?: "light" | "dark";
};

export function ToastStatic({ type, title, message, actionItems, theme = "light" }: ToastStaticProps) {
  const data = TOAST_DATA[type];

  return (
    <div data-theme={theme} className="inline-block">
      <div
        className={cn(
          // Base layout and positioning
          "group flex w-[360px] items-center rounded-2xl border border-subtle-1 shadow-overlay-200",
          "relative",
          data.backgroundColorClassName,
          data.borderColorClassName
        )}
      >
        <div className="flex w-full items-center gap-3 p-3.5">
          <div className="flex-shrink-0">{data.icon}</div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="text-body-sm-semibold text-primary">
              {type === TOAST_TYPE.LOADING ? (title ?? "Loading...") : title}
            </div>
            {type !== TOAST_TYPE.LOADING && message && (
              <div className="text-body-xs-regular text-tertiary">{message}</div>
            )}
          </div>
          {type !== TOAST_TYPE.LOADING && actionItems && <div className={TOAST_ACTION_WRAPPER}>{actionItems}</div>}
        </div>
        <div className={cn(TOAST_CLOSE_BUTTON, "cursor-default")}>
          <ToastCloseGlyph />
        </div>
      </div>
    </div>
  );
}

export const setToast = (props: SetToastProps) => {
  let toastId: string | undefined;
  if (props.type !== TOAST_TYPE.LOADING) {
    toastId = toastManager.add({
      // Top-level `type` drives Base UI's auto-dismiss logic (loading toasts are
      // exempt and persist until replaced); `data.type` drives our rendering.
      type: props.type,
      data: {
        type: props.type,
        title: props.title,
        message: props.message,
        actionItems: props.actionItems,
      },
    });
  } else {
    toastId = toastManager.add({
      type: TOAST_TYPE.LOADING,
      data: {
        type: props.type,
        title: props.title,
      },
    });
  }
  return toastId;
};

export const updateToast = (id: string, props: SetToastProps) => {
  toastManager.update(id, {
    type: props.type,
    data:
      props.type === TOAST_TYPE.LOADING
        ? {
            type: TOAST_TYPE.LOADING,
            title: props.title,
          }
        : {
            type: props.type,
            title: props.title,
            message: props.message,
            actionItems: props.actionItems,
          },
  });
  // Base UI only schedules an auto-dismiss timer on `add`, not on `update`.
  // Loading toasts are added without a timer (they persist until replaced), so
  // when we transition one to a resolved state we must close it ourselves.
  if (props.type !== TOAST_TYPE.LOADING) {
    setTimeout(() => dismissToast(id), DEFAULT_TOAST_TIMEOUT);
  }
};

export const setPromiseToast = <ToastData,>(
  promise: Promise<ToastData>,
  options: PromiseToastOptions<ToastData>
): void => {
  toastManager.promise(promise, {
    loading: {
      data: {
        title: options.loading ?? "Loading...",
        type: TOAST_TYPE.LOADING,
        message: undefined,
        actionItems: undefined,
      },
    },
    success: (data) => ({
      data: {
        type: TOAST_TYPE.SUCCESS,
        title: options.success.title,
        message: options.success.message?.(data),
        actionItems: options.success.actionItems?.(data),
      },
    }),
    error: (data) => ({
      data: {
        type: TOAST_TYPE.ERROR,
        title: options.error.title,
        message: options.error.message?.(data),
        actionItems: options.error.actionItems?.(data),
      },
    }),
  });
};

export const dismissToast = (tId: string) => {
  toastManager.close(tId);
};
