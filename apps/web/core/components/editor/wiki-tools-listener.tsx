/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import type { TCitationCheckResult } from "@plane/editor";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

/**
 * Surfaces results of the editor's Wikipedia tools (/link-terms and
 * /check-citations) as toasts. Mount once at the workspace layout level.
 */
export function WikiToolsListener() {
  useEffect(() => {
    const onGlossaryLinked = (event: Event) => {
      const count = (event as CustomEvent<{ count: number }>).detail?.count ?? 0;
      setToast(
        count > 0
          ? { type: TOAST_TYPE.SUCCESS, title: `Linked ${count} term${count === 1 ? "" : "s"} to Wikipedia` }
          : {
              type: TOAST_TYPE.INFO,
              title: "No linkable terms found",
              message: "No exact Wikipedia matches in this doc.",
            }
      );
    };

    const onCitationCheck = (event: Event) => {
      const detail = (event as CustomEvent<TCitationCheckResult>).detail;
      if (!detail) return;
      if (detail.total === 0) {
        setToast({ type: TOAST_TYPE.INFO, title: "No Wikipedia citations in this doc" });
        return;
      }
      if (detail.broken.length === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: `All ${detail.total} citation${detail.total === 1 ? "" : "s"} resolve`,
        });
        return;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: `${detail.broken.length} of ${detail.total} citations look broken`,
        message: detail.broken.map((b) => b.title).join(", "),
      });
    };

    window.addEventListener("dragonfruit:glossary-linked", onGlossaryLinked);
    window.addEventListener("dragonfruit:citation-check-result", onCitationCheck);
    return () => {
      window.removeEventListener("dragonfruit:glossary-linked", onGlossaryLinked);
      window.removeEventListener("dragonfruit:citation-check-result", onCitationCheck);
    };
  }, []);

  return null;
}
