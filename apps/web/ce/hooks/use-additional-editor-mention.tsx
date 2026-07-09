/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
// plane editor
import { searchWikipedia } from "@plane/editor";
import type { TMentionSection, TMentionSuggestion } from "@plane/editor";
// plane imports
import { WorkItemsIcon } from "@/components/icons/propel-shim";
import { FileText } from "@/components/icons/lucide-shim";
// plane types
import type { TSearchEntities, TSearchResponse } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
// local components
import { WikipediaLogo } from "@/plane-web/components/editor/embeds/mentions/wikipedia-logo";

export type TUseAdditionalEditorMentionArgs = {
  enableAdvancedMentions: boolean;
};

export type TAdditionalEditorMentionHandlerArgs = {
  response: TSearchResponse;
};

export type TAdditionalEditorMentionHandlerReturnType = {
  sections: TMentionSection[];
};

export type TAdditionalParseEditorContentArgs = {
  id: string;
  entityType: TSearchEntities;
};

export type TAdditionalParseEditorContentReturnType =
  | {
      redirectionPath: string;
      textContent: string;
    }
  | undefined;

export const useAdditionalEditorMention = (_args: TUseAdditionalEditorMentionArgs) => {
  const { workspaceSlug } = useParams();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getPageById } = usePageStore(EPageStoreType.PROJECT);

  // Build the extra (non-user) sections for the @-mention dropdown. Work items
  // come back under `issue` from the entity search; other docs under `page`.
  const updateAdditionalSections = useCallback(
    ({ response }: TAdditionalEditorMentionHandlerArgs): TAdditionalEditorMentionHandlerReturnType => {
      const sections: TMentionSection[] = [];
      const issues = response?.issue ?? [];
      if (issues.length > 0) {
        const items: TMentionSuggestion[] = issues.map((issue) => ({
          icon: <WorkItemsIcon className="size-3.5 flex-shrink-0 text-tertiary" />,
          id: issue.id,
          entity_identifier: issue.id,
          entity_name: "issue",
          title: issue.name,
        }));
        sections.push({ key: "issues", title: "Work items", items });
      }
      const pages = response?.page ?? [];
      if (pages.length > 0) {
        const items: TMentionSuggestion[] = pages.map((page) => ({
          icon: <FileText className="size-3.5 flex-shrink-0 text-tertiary" />,
          id: page.id,
          entity_identifier: page.id,
          entity_name: "page",
          title: page.name || "Untitled",
        }));
        sections.push({ key: "pages", title: "Docs", items });
      }
      return { sections };
    },
    []
  );

  // Resolve a non-user mention to display text + a link, used when exporting the
  // doc to markdown/HTML.
  const parseAdditionalEditorContent = useCallback(
    ({ id, entityType }: TAdditionalParseEditorContentArgs): TAdditionalParseEditorContentReturnType => {
      if (entityType === "page") {
        const page = getPageById(id);
        const projectId = page?.project_ids?.[0];
        if (!page || !projectId) return undefined;
        return {
          textContent: page.name || "Untitled",
          redirectionPath: `${workspaceSlug}/projects/${projectId}/pages/${id}`,
        };
      }
      if (entityType !== "issue") return undefined;
      const issue = getIssueById(id);
      if (!issue?.project_id) return undefined;
      return {
        textContent: issue.name,
        redirectionPath: `${workspaceSlug}/projects/${issue.project_id}/issues/${id}`,
      };
    },
    [getIssueById, getPageById, workspaceSlug]
  );

  const editorMentionTypes: TSearchEntities[] = useMemo(() => ["user_mention", "issue", "page"], []);

  // Fetch Wikipedia suggestions for the @-mention dropdown.
  //
  // "wiki" is not a workspace entity type — it is a purely client-side lookup.
  // We never include it in editorMentionTypes / query_type sent to the server.
  // Only triggered when the query is at least 3 chars to avoid spamming the
  // Wikipedia REST API with every keystroke.
  const fetchWikiSections = useCallback(async (query: string): Promise<TMentionSection[]> => {
    if (query.trim().length < 3) return [];
    try {
      const hits = await searchWikipedia(query, { limit: 3 });
      if (!hits.length) return [];
      const items: TMentionSuggestion[] = hits.map((hit) => ({
        icon: <WikipediaLogo className="size-3.5 flex-shrink-0 text-tertiary" />,
        // Use the article key (canonical slug) as the stable id per section.
        id: `wiki-${hit.key}`,
        // entity_identifier carries the full Wikipedia article URL so the
        // renderComponent can open it without an extra fetch.
        entity_identifier: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.key)}`,
        entity_name: "wiki",
        title: hit.title,
        subTitle: hit.description ? hit.description.slice(0, 60) : undefined,
      }));
      return [{ key: "wikipedia", title: "Wikipedia", items }];
    } catch {
      // Soft-fail — workspace mentions still work.
      return [];
    }
  }, []);

  return {
    updateAdditionalSections,
    parseAdditionalEditorContent,
    editorMentionTypes,
    fetchWikiSections,
  };
};
