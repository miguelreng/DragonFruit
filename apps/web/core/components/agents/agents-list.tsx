/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAgent } from "@/services/agent.service";
import { AgentsListItem } from "./agents-list-item";

interface IAgentsListProps {
  agents: TAgent[];
  onToggle: (id: string, next: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AgentsList({ agents, onToggle, onDelete }: IAgentsListProps) {
  return (
    <div className="flex size-full flex-col gap-y-2 overflow-y-auto rounded-lg border border-subtle bg-layer-1 p-3">
      {agents.map((agent) => (
        <AgentsListItem key={agent.id} agent={agent} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </div>
  );
}
