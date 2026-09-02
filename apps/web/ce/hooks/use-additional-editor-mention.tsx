/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
// plane editor
import { searchWikipedia } from "@dragonfruit/editor";
import type { TMentionSection, TMentionSuggestion } from "@dragonfruit/editor";
// plane imports
import { WorkItemsIcon } from "@/components/icons/propel-shim";
import { Calendar, FileText, Whiteboard } from "@/components/icons/lucide-shim";
// plane types
import type { TSearchEntities, TSearchResponse } from "@dragonfruit/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
// local components
import { WikipediaLogo } from "@/plane-web/components/editor/embeds/mentions/wikipedia-logo";
import { getPageMentionKind, shouldSuggestProjectCalendar } from "./editor-mention-helpers";

export type TUseAdditionalEditorMentionArgs = {
  enableAdvancedMentions: boolean;
};

export type TAdditionalEditorMentionHandlerArgs = {
  query: string;
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
  const { workspaceSlug, projectId } = useParams();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getProjectById } = useProject();
  const { getPageById } = usePageStore(EPageStoreType.PROJECT);

  // Build the extra (non-user) sections for the @-mention dropdown. Work items
  // come back under `issue` from the entity search; other docs under `page`.
  const updateAdditionalSections = useCallback(
    ({ query, response }: TAdditionalEditorMentionHandlerArgs): TAdditionalEditorMentionHandlerReturnType => {
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
        const currentProjectId = projectId?.toString();
        const pageItems: TMentionSuggestion[] = [];
        const whiteboardItems: TMentionSuggestion[] = [];
        pages.forEach((page) => {
          if (!page.id) return;
          // The backend serializes `projects__id` as one uuid per row even
          // though the type declares an array — handle both shapes.
          const pageProjectId = Array.isArray(page.projects__id) ? page.projects__id[0] : page.projects__id;
          const isOtherProject = !!pageProjectId && !!currentProjectId && pageProjectId !== currentProjectId;
          const mentionKind = getPageMentionKind(page.page_type);
          const item: TMentionSuggestion = {
            icon:
              mentionKind === "whiteboard" ? (
                <Whiteboard className="size-3.5 flex-shrink-0 text-tertiary" />
              ) : (
                <FileText className="size-3.5 flex-shrink-0 text-tertiary" />
              ),
            id: page.id,
            entity_identifier: page.id,
            entity_name: mentionKind,
            title: page.name || "Untitled",
            // Disambiguate docs coming from other projects.
            subTitle: isOtherProject ? getProjectById(pageProjectId)?.name : undefined,
          };
          if (mentionKind === "whiteboard") {
            whiteboardItems.push(item);
          } else {
            pageItems.push(item);
          }
        });
        if (pageItems.length > 0) sections.push({ key: "pages", title: "Docs", items: pageItems });
        if (whiteboardItems.length > 0)
          sections.push({ key: "whiteboards", title: "Whiteboards", items: whiteboardItems });
      }

      const currentProjectId = projectId?.toString();
      const currentProject = currentProjectId ? getProjectById(currentProjectId) : undefined;
      if (currentProjectId && shouldSuggestProjectCalendar(query, currentProject?.name)) {
        sections.push({
          key: "project-links",
          title: "Project links",
          items: [
            {
              icon: <Calendar className="size-3.5 flex-shrink-0 text-tertiary" />,
              id: `calendar-${currentProjectId}`,
              entity_identifier: currentProjectId,
              entity_name: "calendar",
              title: currentProject?.name ? `${currentProject.name} calendar` : "Project calendar",
            },
          ],
        });
      }
      return { sections };
    },
    [getProjectById, projectId]
  );

  // Resolve a non-user mention to display text + a link, used when exporting the
  // doc to markdown/HTML.
  const parseAdditionalEditorContent = useCallback(
    ({ id, entityType }: TAdditionalParseEditorContentArgs): TAdditionalParseEditorContentReturnType => {
      if (entityType === "page") {
        const page = getPageById(id);
        const pageProjectId = page?.project_ids?.[0];
        if (!page || !pageProjectId) return undefined;
        return {
          textContent: page.name || "Untitled",
          redirectionPath: `${workspaceSlug}/projects/${pageProjectId}/pages/${id}`,
        };
      }
      if (entityType === "whiteboard") {
        const page = getPageById(id);
        const pageProjectId = page?.project_ids?.[0];
        if (!page || !pageProjectId) return undefined;
        return {
          textContent: page.name || "Untitled whiteboard",
          redirectionPath: `${workspaceSlug}/projects/${pageProjectId}/pages/${id}`,
        };
      }
      if (entityType === "calendar") {
        const project = getProjectById(id);
        return {
          textContent: project?.name ? `${project.name} calendar` : "Project calendar",
          redirectionPath: `${workspaceSlug}/projects/${id}/calendar`,
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
    [getIssueById, getPageById, getProjectById, workspaceSlug]
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
