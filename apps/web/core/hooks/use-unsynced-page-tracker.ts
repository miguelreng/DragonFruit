/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import type { CollaborationState } from "@plane/editor";
import { clearPageUnsynced, markPageUnsynced } from "@/helpers/unsynced-pages";

type Args = {
  pageId: string | undefined;
  pageName: string | undefined;
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  /** Pulled from PageRoot — null until the provider has emitted state. */
  collaborationState: CollaborationState | null;
};

/**
 * Watch the collab session for the open page. If we ever leave a `synced`
 * state with cached IDB content (meaning local edits exist beyond what the
 * server has acknowledged), the page is registered as "unsaved" in
 * localStorage. The next successful sync wipes the registration.
 *
 * No-op when ids are missing (e.g. before page load) or the page never
 * actually entered an edit session.
 */
export function useUnsyncedPageTracker({ pageId, pageName, workspaceSlug, projectId, collaborationState }: Args) {
  // The user has actually touched this doc in this session — set on first non-synced state
  // after a synced one (i.e. they made an edit while disconnected) OR on any disconnected
  // state with cached content. We do NOT want to mark every page the user merely opens.
  const everEditedRef = useRef(false);

  useEffect(() => {
    if (!pageId || !workspaceSlug || !projectId || !collaborationState) return;

    const { stage } = collaborationState;

    if (stage.kind === "synced") {
      everEditedRef.current = false;
      clearPageUnsynced(pageId);
      return;
    }

    // Disconnected with local cache => almost certainly unsynced edits.
    if (stage.kind === "disconnected") {
      everEditedRef.current = true;
      markPageUnsynced({
        page_id: pageId,
        page_name: pageName || "Untitled",
        workspace_slug: workspaceSlug,
        project_id: projectId,
        last_edit_at: new Date().toISOString(),
      });
    }
  }, [collaborationState, pageId, pageName, workspaceSlug, projectId]);
}
