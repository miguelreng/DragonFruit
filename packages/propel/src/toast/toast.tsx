/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { Toast as BaseToast } from "@base-ui-components/react/toast";
import {
  DangerCircle as AlertCircle,
  DangerTriangle as AlertTriangle,
  CheckCircle as BadgeCheck,
  InfoCircle as InfoIcon,
} from "@solar-icons/react/ssr";
import { CloseIcon } from "../icons/actions/close-icon";
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

export function Toast(props: ToastProps) {
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

// Filled, type-colored "badge" glyphs — the main signal in the action-pill
// style. Fill is driven off the semantic background tokens so each badge stays
// correct in both light and dark; the glyph itself knocks out white.
const TOAST_DATA = {
  [TOAST_TYPE.SUCCESS]: {
    icon: (
      <BadgeCheck
        width={22}
        height={22}
        strokeWidth={2}
        className="text-white"
        style={{ fill: "var(--bg-success-primary)" }}
      />
    ),
    backgroundColorClassName: "!bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.CURSOR_BUDDY_SUCCESS]: {
    icon: (
      <BadgeCheck
        width={22}
        height={22}
        strokeWidth={2}
        className="text-white"
        style={{ fill: "var(--bg-success-primary)" }}
      />
    ),
    backgroundColorClassName: "!bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.ERROR]: {
    icon: (
      <AlertCircle
        width={22}
        height={22}
        strokeWidth={2}
        className="text-white"
        style={{ fill: "var(--bg-danger-primary)" }}
      />
    ),
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.WARNING]: {
    icon: (
      <AlertTriangle
        width={22}
        height={22}
        strokeWidth={2}
        className="text-white"
        style={{ fill: "var(--bg-warning-primary)" }}
      />
    ),
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.INFO]: {
    icon: (
      <InfoIcon
        width={22}
        height={22}
        strokeWidth={2}
        className="text-white"
        style={{ fill: "var(--bg-accent-primary)" }}
      />
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
      <div className="flex w-full items-center gap-3 p-3.5 pr-9">
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
      <BaseToast.Close className="absolute top-2.5 right-2.5 cursor-pointer text-icon-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:text-icon-secondary">
        <CloseIcon strokeWidth={1.5} width={14} height={14} />
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
        <div className="flex w-full items-center gap-3 p-3.5 pr-9">
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
        <div className="absolute top-2.5 right-2.5 cursor-default text-icon-tertiary">
          <CloseIcon strokeWidth={1.5} width={14} height={14} />
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
