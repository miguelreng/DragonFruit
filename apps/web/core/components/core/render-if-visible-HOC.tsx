/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode, MutableRefObject } from "react";
import React, { useState, useRef, useEffect } from "react";
import { cn } from "@plane/utils";

// One IntersectionObserver per (root, rootMargin) tuple, shared across all
// rows. Each row registers an element-keyed callback. The previous
// implementation spawned one observer per row, which dominated CPU on long
// lists (500+ rows = 500+ live observers + 500+ teardown effects on scroll).
type Callback = (isVisible: boolean) => void;
type SharedEntry = { observer: IntersectionObserver; callbacks: WeakMap<Element, Callback> };

const rootIds = new WeakMap<Element, string>();
let nextRootId = 1;
const idForRoot = (root: Element | null): string => {
  if (!root) return "doc";
  let id = rootIds.get(root);
  if (!id) {
    id = `r${nextRootId++}`;
    rootIds.set(root, id);
  }
  return id;
};

const sharedObservers = new Map<string, SharedEntry>();
const getSharedObserver = (root: Element | null, rootMargin: string): SharedEntry => {
  const key = `${idForRoot(root)}|${rootMargin}`;
  const cached = sharedObservers.get(key);
  if (cached) return cached;
  const callbacks = new WeakMap<Element, Callback>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const cb = callbacks.get(entry.target);
        if (cb) cb(entry.isIntersecting);
      }
    },
    { root, rootMargin }
  );
  const entry: SharedEntry = { observer, callbacks };
  sharedObservers.set(key, entry);
  return entry;
};

type Props = {
  defaultHeight?: string;
  verticalOffset?: number;
  horizontalOffset?: number;
  root?: MutableRefObject<HTMLElement | null>;
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
  classNames?: string;
  placeholderChildren?: ReactNode;
  defaultValue?: boolean;
  shouldRecordHeights?: boolean;
  useIdletime?: boolean;
  forceRender?: boolean;
};

function RenderIfVisible(props: Props) {
  const {
    defaultHeight = "300px",
    root,
    verticalOffset = 50,
    horizontalOffset = 0,
    as = "div",
    children,
    classNames = "",
    shouldRecordHeights = true,
    placeholderChildren = null,
    defaultValue = false,
    useIdletime = false,
    forceRender = false,
  } = props;

  const [shouldVisible, setShouldVisible] = useState<boolean>(defaultValue);
  const placeholderHeight = useRef<string>(defaultHeight);
  const intersectionRef = useRef<HTMLElement | null>(null);

  const isVisible = shouldVisible || forceRender;

  // Register with the shared observer. Deps deliberately exclude `children`
  // (the previous impl included it and tore down + recreated the observer on
  // every children-identity change, which on MobX-driven lists meant every
  // store update).
  useEffect(() => {
    const el = intersectionRef.current;
    if (!el) return;
    const rootMargin = `${verticalOffset}% ${horizontalOffset}% ${verticalOffset}% ${horizontalOffset}%`;
    const { observer, callbacks } = getSharedObserver(root?.current ?? null, rootMargin);

    const callback: Callback = (visible) => {
      if (useIdletime && typeof window !== "undefined" && window.requestIdleCallback) {
        window.requestIdleCallback(() => setShouldVisible(visible), { timeout: 300 });
      } else {
        setShouldVisible(visible);
      }
    };
    callbacks.set(el, callback);
    observer.observe(el);

    return () => {
      observer.unobserve(el);
      callbacks.delete(el);
    };
  }, [root, verticalOffset, horizontalOffset, useIdletime]);

  // Capture rendered height so the placeholder collapses to the right size
  // when the row scrolls back off-screen.
  useEffect(() => {
    if (!isVisible || !shouldRecordHeights) return;
    if (typeof window === "undefined" || !window.requestIdleCallback) return;
    window.requestIdleCallback(() => {
      if (intersectionRef.current) placeholderHeight.current = `${intersectionRef.current.offsetHeight}px`;
    });
  }, [isVisible, shouldRecordHeights]);

  const child = isVisible ? <>{children}</> : placeholderChildren;
  const style = isVisible || !shouldRecordHeights ? {} : { height: placeholderHeight.current, width: "100%" };
  const className = isVisible || placeholderChildren ? classNames : cn(classNames, "bg-layer-1");

  return React.createElement(as, { ref: intersectionRef, style, className }, child);
}

export default RenderIfVisible;
