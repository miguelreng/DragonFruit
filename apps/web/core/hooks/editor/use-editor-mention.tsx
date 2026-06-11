/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { useParams } from "next/navigation";
// plane editor
import type { TMentionSection, TMentionSuggestion } from "@plane/editor";
// plane types
import type { TSearchEntityRequestPayload, TSearchResponse, TUserSearchResponse } from "@plane/types";
// plane ui
import { Avatar } from "@plane/ui";
// helpers
import { getFileURL } from "@plane/utils";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
// plane web hooks
import { useAdditionalEditorMention } from "@/plane-web/hooks/use-additional-editor-mention";

type TArgs = {
  enableAdvancedMentions?: boolean;
  searchEntity: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
};

export const useEditorMention = (args: TArgs) => {
  const { enableAdvancedMentions = false, searchEntity } = args;
  // router
  const { workspaceSlug } = useParams();
  // additional mentions
  const { editorMentionTypes, updateAdditionalSections, fetchWikiSections } = useAdditionalEditorMention({
    enableAdvancedMentions,
  });
  // agent store — used to surface workspace agents alongside human mentions.
  // We can't ask the search backend for these (yet); merging client-side
  // keeps the @-picker working without a round-trip schema change.
  const agentStore = useAgent();
  // fetch mentions handler
  const fetchMentions = useCallback(
    async (query: string): Promise<TMentionSection[]> => {
      try {
        const slug = workspaceSlug?.toString();
        // Kick off an agent fetch the first time we open the picker in a
        // workspace; later calls reuse the cached list synchronously.
        if (slug && !agentStore.fetchedWorkspaces[slug]) {
          await agentStore.fetchAgents(slug).catch(() => {
            // Soft-fail: human mentions still work.
          });
        }
        const agentMatches = slug ? agentStore.getEnabledAgentsForWorkspace(slug) : [];
        const normalizedQuery = query.trim().toLowerCase();
        const agentItems: TMentionSuggestion[] = agentMatches
          .filter((a) => (normalizedQuery === "" ? true : a.name.toLowerCase().includes(normalizedQuery)))
          .map((a) => ({
            icon: <Avatar className="flex-shrink-0" src={getFileURL(a.avatar_url ?? "")} name={a.name} />,
            id: a.bot_user_id,
            entity_identifier: a.bot_user_id,
            entity_name: "user_mention",
            title: a.name,
          }));

        const res = await searchEntity({
          count: 5,
          query_type: editorMentionTypes,
          query,
        });
        const suggestionSections: TMentionSection[] = [];
        if (!res) {
          throw new Error("No response found");
        }
        Object.keys(res).map((key) => {
          // Cast to keyof TSearchResponse (not TSearchEntities) because "wiki"
          // is a client-side-only entity type not present in TSearchResponse.
          const responseKey = key as keyof TSearchResponse;
          const response = res[responseKey];
          if (responseKey === "user_mention" && response && response.length > 0) {
            const items: TMentionSuggestion[] = (response as TUserSearchResponse[]).map((user) => ({
              icon: (
                <Avatar
                  className="flex-shrink-0"
                  src={getFileURL(user.member__avatar_url)}
                  name={user.member__display_name}
                />
              ),
              id: user.member__id,
              entity_identifier: user.member__id,
              entity_name: "user_mention",
              title: user.member__display_name,
            }));
            suggestionSections.push({
              key: "users",
              title: "Users",
              items: [...items, ...agentItems],
            });
          }
        });
        // If the backend returned no human matches, still surface agents
        // so an agent-only workspace (or a query that only matches agents)
        // isn't an empty dropdown.
        if (!suggestionSections.find((s) => s.key === "users") && agentItems.length > 0) {
          suggestionSections.push({
            key: "users",
            title: "Users",
            items: agentItems,
          });
        }
        const { sections } = updateAdditionalSections({
          response: res,
        });
        // Append Wikipedia results (client-side only, never sent to the API).
        // fetchWikiSections is a no-op for queries shorter than 3 chars.
        const wikiSections = fetchWikiSections ? await fetchWikiSections(query) : [];
        return [...suggestionSections, ...sections, ...wikiSections];
      } catch (error) {
        console.error("Error in fetching mentions:", error);
        throw error;
      }
    },
    [editorMentionTypes, searchEntity, updateAdditionalSections, fetchWikiSections, workspaceSlug, agentStore]
  );

  return {
    fetchMentions,
  };
};
