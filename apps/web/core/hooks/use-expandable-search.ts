/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import { useOutsideClickDetector } from "@plane/hooks";

type UseExpandableSearchOptions = {
  onClose?: () => void;
};

/**
 * Custom hook for expandable search input behavior
 * Handles focus management to prevent unwanted opening on programmatic focus restoration
 * Opens on click, typing, or keyboard shortcut (via PowerK Cmd+F)
 */
export const useExpandableSearch = (options?: UseExpandableSearchOptions) => {
  const { onClose } = options || {};

  // states
  const [isOpen, setIsOpen] = useState(false);

  // refs
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasClickedRef = useRef<boolean>(false);
  const wasKeyboardTriggeredRef = useRef<boolean>(false);

  // Handle close
  const handleClose = useCallback(() => {
    setIsOpen(false);
    inputRef.current?.blur();
    // Reset trigger flags so a stale "yes, open me" doesn't survive across
    // open/close cycles and fire on the next unrelated focus event (e.g. a
    // browser extension probing the input).
    wasClickedRef.current = false;
    wasKeyboardTriggeredRef.current = false;
    onClose?.();
  }, [onClose]);

  // Outside click handler - memoized to prevent unnecessary re-registrations
  const handleOutsideClick = useCallback(() => {
    if (isOpen) {
      handleClose();
    }
  }, [isOpen, handleClose]);

  // Outside click detection
  useOutsideClickDetector(containerRef, handleOutsideClick);

  // Track keyboard shortcuts that trigger focus (Cmd+F / Ctrl+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore synthetic events from browser extensions (password managers
      // dispatch malformed keydowns on nearby inputs when probing).
      if (!e.isTrusted) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        // Mark as keyboard triggered so handleFocus knows to open
        wasKeyboardTriggeredRef.current = true;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Track explicit clicks — guard against synthetic events from extensions.
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!e.nativeEvent.isTrusted) return;
    wasClickedRef.current = true;
  }, []);

  // Open on explicit clicks or keyboard shortcut, not programmatic focus restoration
  const handleFocus = useCallback((e: FocusEvent) => {
    // Synthetic focus events (e.g. from password manager probes) should never
    // open the panel, regardless of what the trigger flags currently say.
    if (!e.nativeEvent.isTrusted) return;
    if (wasClickedRef.current || wasKeyboardTriggeredRef.current) {
      setIsOpen(true);
      wasClickedRef.current = false;
      wasKeyboardTriggeredRef.current = false;
    }
  }, []);

  // Helper to open panel (for typing/onChange)
  const openPanel = useCallback(() => {
    if (!isOpen) {
      setIsOpen(true);
    }
  }, [isOpen]);

  return {
    // State
    isOpen,
    setIsOpen,

    // Refs
    containerRef,
    inputRef,

    // Handlers
    handleClose,
    handleMouseDown,
    handleFocus,
    openPanel,
  };
};
