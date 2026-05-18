/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FileText, X } from "@/components/icons/lucide-shim";
import { renderFormattedDate } from "@plane/utils";
import { clearPageUnsynced, listUnsyncedPages, type TUnsyncedPageEntry } from "@/helpers/unsynced-pages";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  workspaceSlug: string;
};

/**
 * "Unsaved docs" panel on the Drafts page. Lists pages where the local Yjs
 * session dropped without a successful sync. Clearing only removes the local
 * marker — the doc itself stays in Yjs IndexedDB until reopened.
 */
export function UnsavedDocsSection({ workspaceSlug }: Props) {
  const [entries, setEntries] = useState<TUnsyncedPageEntry[]>([]);
  const { getProjectById } = useProject();

  useEffect(() => {
    const refresh = () => setEntries(listUnsyncedPages(workspaceSlug));
    refresh();
    // Same-tab updates fire a custom event; cross-tab via the native `storage` event.
    window.addEventListener("dragonfruit:unsynced-pages-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dragonfruit:unsynced-pages-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [workspaceSlug]);

  if (entries.length === 0) return null;

  return (
    <div className="mb-6 rounded-md border border-subtle-1 bg-canvas">
      <div className="flex items-center justify-between border-b border-subtle-1 px-4 py-2.5">
        <span className="text-sm font-medium">Unsaved docs</span>
        <span className="text-xs text-tertiary">{entries.length}</span>
      </div>
      <ul className="flex flex-col divide-y divide-subtle-1">
        {entries.map((e) => (
          <li key={e.page_id} className="group flex items-center gap-3 px-4 py-2.5">
            <FileText className="size-4 shrink-0 text-tertiary" />
            <Link
              to={`/${e.workspace_slug}/projects/${e.project_id}/pages/${e.page_id}/`}
              className="flex min-w-0 flex-1 flex-col"
            >
              <span className="truncate text-sm font-medium text-primary group-hover:underline">
                {e.page_name || "Untitled"}
              </span>
              <span className="text-xs text-tertiary">
                {getProjectById(e.project_id)?.name ?? "—"} · edited {renderFormattedDate(new Date(e.last_edit_at))}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => {
                clearPageUnsynced(e.page_id);
                setEntries((prev) => prev.filter((x) => x.page_id !== e.page_id));
              }}
              className="text-tertiary hover:text-primary"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
