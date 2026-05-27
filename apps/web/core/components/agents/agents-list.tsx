/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAgent } from "@/services/agent.service";
import { AgentsListItem, type TAgentTriggerKey } from "./agents-list-item";

interface IAgentsListProps {
  agents: TAgent[];
  onToggle: (id: string, next: boolean) => Promise<void>;
  onEdit: (agent: TAgent) => void;
  onUpdateTrigger: (id: string, key: TAgentTriggerKey, next: boolean) => Promise<void>;
}

export function AgentsList({ agents, onToggle, onEdit, onUpdateTrigger }: IAgentsListProps) {
  return (
    <div className="flex size-full flex-col divide-y divide-subtle overflow-hidden rounded-lg border border-subtle bg-layer-2">
      {agents.map((agent) => (
        <AgentsListItem
          key={agent.id}
          agent={agent}
          onToggle={onToggle}
          onEdit={onEdit}
          onUpdateTrigger={onUpdateTrigger}
        />
      ))}
    </div>
  );
}
