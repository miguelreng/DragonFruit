/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { IUserLite } from "@plane/types";
// services
import { AgentService, type TAgent } from "@/services/agent.service";

export interface IAgentStore {
  // observables
  agentsByWorkspace: Record<string, Record<string, TAgent>>;
  fetchedWorkspaces: Record<string, boolean>;
  // computed actions
  getAgentsForWorkspace: (workspaceSlug: string) => TAgent[];
  getEnabledAgentsForWorkspace: (workspaceSlug: string) => TAgent[];
  getEnabledAgentBotUserIds: (workspaceSlug: string) => string[];
  getAgentByBotUserId: (botUserId: string) => TAgent | undefined;
  getAgentAsUserLite: (botUserId: string) => IUserLite | undefined;
  // fetch actions
  fetchAgents: (workspaceSlug: string) => Promise<TAgent[]>;
}

export class AgentStore implements IAgentStore {
  agentsByWorkspace: Record<string, Record<string, TAgent>> = {};
  fetchedWorkspaces: Record<string, boolean> = {};
  // service
  private agentService: AgentService;

  constructor() {
    makeObservable(this, {
      agentsByWorkspace: observable,
      fetchedWorkspaces: observable,
      fetchAgents: action,
    });
    this.agentService = new AgentService();
  }

  getAgentsForWorkspace = computedFn((workspaceSlug: string): TAgent[] => {
    const map = this.agentsByWorkspace[workspaceSlug];
    if (!map) return [];
    return Object.values(map);
  });

  getEnabledAgentsForWorkspace = computedFn((workspaceSlug: string): TAgent[] =>
    this.getAgentsForWorkspace(workspaceSlug).filter((a) => a.is_enabled)
  );

  getEnabledAgentBotUserIds = computedFn((workspaceSlug: string): string[] =>
    this.getEnabledAgentsForWorkspace(workspaceSlug).map((a) => a.bot_user_id)
  );

  getAgentByBotUserId = computedFn((botUserId: string): TAgent | undefined => {
    for (const slug of Object.keys(this.agentsByWorkspace)) {
      const map = this.agentsByWorkspace[slug];
      for (const agentId of Object.keys(map)) {
        if (map[agentId]?.bot_user_id === botUserId) return map[agentId];
      }
    }
    return undefined;
  });

  /**
   * Synthesize an IUserLite from an agent's backing bot user so callers
   * that look up "users" (dropdowns, mention previews) can surface
   * agents without each one having to know about the agent store.
   */
  getAgentAsUserLite = computedFn((botUserId: string): IUserLite | undefined => {
    const agent = this.getAgentByBotUserId(botUserId);
    if (!agent) return undefined;
    return {
      id: agent.bot_user_id,
      display_name: agent.name,
      first_name: agent.name,
      last_name: "",
      avatar_url: agent.avatar_url ?? "",
      email: agent.bot_user_email,
      is_bot: true,
    };
  });

  fetchAgents = async (workspaceSlug: string): Promise<TAgent[]> => {
    const agents = await this.agentService.list(workspaceSlug);
    runInAction(() => {
      const nextMap: Record<string, TAgent> = {};
      agents.forEach((a) => {
        nextMap[a.id] = a;
      });
      set(this.agentsByWorkspace, [workspaceSlug], nextMap);
      this.fetchedWorkspaces[workspaceSlug] = true;
    });
    return agents;
  };
}
