/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { X } from "@/components/icons/lucide-shim";
import { PageIcon } from "@plane/propel/icons";
import { cn, renderFormattedDate } from "@plane/utils";
import { clearPageUnsynced, listUnsyncedPages, type TUnsyncedPageEntry } from "@/helpers/unsynced-pages";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  workspaceSlug: string;
};

/**
 * "Unsaved docs" panel on the Drafts page. Lists pages where the local Yjs
 * session dropped without a successful sync. Clearing only removes the local
 * marker — the doc itself stays in Yjs IndexedDB until reopened.
 *
 * Cards mirror the Docs grid (see workspace-docs-root.tsx → DocCard) so the
 * surface is visually contiguous with the rest of the docs system.
 */
export function UnsavedDocsSection({ workspaceSlug }: Props) {
  const [entries, setEntries] = useState<TUnsyncedPageEntry[]>([]);
  const { getProjectById } = useProject();

  useEffect(() => {
    const refresh = () => setEntries(listUnsyncedPages(workspaceSlug));
    refresh();
    window.addEventListener("dragonfruit:unsynced-pages-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dragonfruit:unsynced-pages-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [workspaceSlug]);

  if (entries.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-13 font-semibold text-primary">Unsaved docs</h2>
        <span className="text-11 text-tertiary">{entries.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {entries.map((entry) => (
          <UnsavedDocCard
            key={entry.page_id}
            entry={entry}
            projectName={getProjectById(entry.project_id)?.name ?? "—"}
            onDismiss={() => {
              clearPageUnsynced(entry.page_id);
              setEntries((prev) => prev.filter((x) => x.page_id !== entry.page_id));
            }}
          />
        ))}
      </div>
    </section>
  );
}

type CardProps = {
  entry: TUnsyncedPageEntry;
  projectName: string;
  onDismiss: () => void;
};

function UnsavedDocCard({ entry, projectName, onDismiss }: CardProps) {
  const itemLink = `/${entry.workspace_slug}/projects/${entry.project_id}/pages/${entry.page_id}/`;

  return (
    <div className="group relative">
      <Link
        to={itemLink}
        className="focus-visible:ring-accent-primary/40 block rounded-lg focus:outline-none focus-visible:ring-2"
      >
        <div
          className={cn(
            "flex h-[260px] flex-col gap-3 rounded-lg border border-subtle bg-surface-1 p-4 transition-colors",
            "hover:border-strong"
          )}
        >
          <div className="flex items-start gap-2.5 pr-6">
            <span className="grid size-5 shrink-0 place-items-center">
              <PageIcon className="size-4 text-tertiary" />
            </span>
            <h3 className="line-clamp-2 flex-1 text-13 leading-tight font-semibold text-primary">
              {entry.page_name || "Untitled"}
            </h3>
          </div>
          <div className="relative flex-1 overflow-hidden rounded-lg border border-subtle/60">
            <div className="absolute inset-0 grid place-items-center text-tertiary/60">
              <PageIcon className="size-8" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-11 text-tertiary">
            <span className="truncate rounded-lg bg-layer-1 px-1.5 py-0.5 text-secondary">{projectName}</span>
            <span className="ml-auto shrink-0">edited {renderFormattedDate(new Date(entry.last_edit_at))}</span>
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        className="absolute top-3 right-3 grid size-6 place-items-center rounded-lg text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-layer-1 hover:text-primary focus:opacity-100"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
