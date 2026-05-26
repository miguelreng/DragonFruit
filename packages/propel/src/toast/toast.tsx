/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { Toast as BaseToast } from "@base-ui-components/react/toast";
import { AlertTriangle, CheckIcon, InfoIcon, Sparkles, XIcon } from "lucide-react";
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
};

const toastManager = BaseToast.createToastManager();

export function Toast(props: ToastProps) {
  return (
    <BaseToast.Provider toastManager={toastManager}>
      <BaseToast.Portal>
        <BaseToast.Viewport data-theme={props.theme}>
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

const TOAST_DATA = {
  [TOAST_TYPE.SUCCESS]: {
    icon: <CheckIcon width={14} height={14} className="text-on-color" />,
    iconBgClassName: "bg-success-primary",
    backgroundColorClassName: "!bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.CURSOR_BUDDY_SUCCESS]: {
    icon: (
      <span className="relative grid size-3.5 place-items-center">
        <span
          aria-hidden
          className="bg-on-color/35 absolute size-3 animate-ping rounded-full [animation-duration:1.8s]"
        />
        <Sparkles width={14} height={14} className="relative text-on-color" />
      </span>
    ),
    iconBgClassName: "bg-success-primary",
    backgroundColorClassName: "!bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.ERROR]: {
    icon: <XIcon width={12} height={12} className="text-on-color" />,
    iconBgClassName: "bg-danger-primary",
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.WARNING]: {
    icon: <AlertTriangle width={12} height={12} className="text-on-color" />,
    iconBgClassName: "bg-warning-primary",
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.INFO]: {
    icon: <InfoIcon width={12} height={12} className="text-on-color" />,
    iconBgClassName: "bg-accent-primary",
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.LOADING]: {
    icon: <CircularBarSpinner className="text-on-color" />,
    iconBgClassName: "bg-layer-2",
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
  [TOAST_TYPE.LOADING_TOAST]: {
    icon: <CircularBarSpinner className="text-on-color" />,
    iconBgClassName: "bg-layer-2",
    backgroundColorClassName: "bg-surface-1",
    borderColorClassName: "border-subtle",
  },
};

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
      className={cn(
        // Base layout and positioning
        "group flex w-[350px] max-w-[calc(100vw-2rem)] items-start rounded-lg border border-subtle-1 shadow-overlay-100",
        "absolute top-3 right-3 z-[calc(1000-var(--toast-index))]",
        "transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] select-none",

        // Default transform with stacking and scaling
        "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+calc(min(var(--toast-index),10)*10px)))_scale(calc(max(0,1-(var(--toast-index)*0.1))))]",

        // Pseudo-element for gap spacing
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",

        // State-based opacity
        "data-[ending-style]:opacity-0 data-[limited]:opacity-0",

        // Starting animation
        "data-[starting-style]:[transform:translateY(-150%)]",

        // Expanded state transform
        "data-[expanded]:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y)))]",

        // Swipe direction endings - consolidated
        "data-[ending-style]:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-[ending-style]:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-[ending-style]:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-[ending-style]:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",

        // Default ending transform for non-limited toasts
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
      <BaseToast.Close className="absolute top-1 right-1 cursor-pointer text-icon-tertiary hover:text-icon-secondary">
        <CloseIcon strokeWidth={1.5} width={14} height={14} />
      </BaseToast.Close>
      <div className="flex w-full items-start gap-3 p-4 pr-9">
        <div className="py-1">
          {data.icon && (
            <div
              className={cn(
                "flex flex-shrink-0 items-center justify-center rounded-full",
                "size-4",
                data.iconBgClassName
              )}
            >
              {data.icon}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <BaseToast.Title className="text-body-sm-medium text-primary">
            {toastData.type === TOAST_TYPE.LOADING ? (toastData.title ?? "Loading...") : toastData.title}
          </BaseToast.Title>
          {toastData.type !== TOAST_TYPE.LOADING && toastData.message && (
            <BaseToast.Description className="text-body-xs-regular text-tertiary">
              {toastData.message}
            </BaseToast.Description>
          )}
          {toastData.type !== TOAST_TYPE.LOADING && toastData.actionItems && (
            <div className="flex items-center gap-2">{toastData.actionItems}</div>
          )}
        </div>
      </div>
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
          "group flex w-[350px] items-start rounded-lg border border-subtle-1 shadow-overlay-100",
          "relative",
          data.backgroundColorClassName,
          data.borderColorClassName
        )}
      >
        <div className="absolute top-1 right-1 cursor-default text-icon-tertiary">
          <CloseIcon strokeWidth={1.5} width={14} height={14} />
        </div>
        <div className="flex w-full items-start gap-3 p-4">
          <div className="py-1">
            {data.icon && (
              <div
                className={cn(
                  "flex size-4 flex-shrink-0 items-center justify-center rounded-full",
                  data.iconBgClassName
                )}
              >
                {data.icon}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="text-body-sm-medium text-primary">
              {type === TOAST_TYPE.LOADING ? (title ?? "Loading...") : title}
            </div>
            {type !== TOAST_TYPE.LOADING && message && (
              <div className="text-body-xs-regular text-tertiary">{message}</div>
            )}
            {type !== TOAST_TYPE.LOADING && actionItems && <div className="flex items-center gap-2">{actionItems}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export const setToast = (props: SetToastProps) => {
  let toastId: string | undefined;
  if (props.type !== TOAST_TYPE.LOADING) {
    toastId = toastManager.add({
      data: {
        type: props.type,
        title: props.title,
        message: props.message,
        actionItems: props.actionItems,
      },
    });
  } else {
    toastId = toastManager.add({
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
