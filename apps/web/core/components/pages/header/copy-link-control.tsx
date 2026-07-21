/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { observer } from "mobx-react";

import { Share2 } from "@/components/icons/lucide-shim";
import { CheckIcon } from "@/components/icons/propel-shim";
// plane imports
import { Button } from "@plane/propel/button";
// hooks
import { usePageOperations } from "@/hooks/use-page-operations";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
};

export const PageCopyLinkControl = observer(function PageCopyLinkControl({ page }: Props) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // page operations
  const { pageOperations } = usePageOperations({
    page,
  });

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  const handleCopy = useCallback(() => {
    pageOperations.copyLink();
    setIsCopied(true);

    // Clear previous timer if it exists
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(() => {
      setIsCopied(false);
      timerRef.current = null;
    }, 1000);
  }, [pageOperations]);

  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={handleCopy}
      aria-label={isCopied ? "Copied link" : "Share doc"}
      className="px-2.5"
    >
      {isCopied ? <CheckIcon className="size-4 text-success-primary" /> : <Share2 className="size-4" />}
      <span className="hidden sm:inline">{isCopied ? "Copied" : "Share"}</span>
    </Button>
  );
});
