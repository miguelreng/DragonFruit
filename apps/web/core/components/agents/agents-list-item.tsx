/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { useState } from "react";
// plane imports
import { ToggleSwitch } from "@plane/ui";
// services
import type { TAgent } from "@/services/agent.service";
// local
import { ChevronDown, ChevronRight, Trash2 } from "@/components/icons/lucide-shim";
import { AgentRunsPanel } from "./agent-runs-panel";

interface IAgentsListItemProps {
  agent: TAgent;
  onToggle: (id: string, next: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AgentsListItem({ agent, onToggle, onDelete }: IAgentsListItemProps) {
  const { workspaceSlug } = useParams();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onToggle(agent.id, !agent.is_enabled);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    const confirmed = window.confirm(`Delete agent "${agent.name}"? This cannot be undone.`);
    if (!confirmed) return;
    setBusy(true);
    try {
      await onDelete(agent.id);
    } finally {
      setBusy(false);
    }
  };

  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="overflow-hidden rounded-lg border border-subtle bg-layer-2">
      {/*
        Layout note: the disclosure trigger (the row) and the controls
        (toggle + delete) are siblings, not nested — HTML doesn't allow
        buttons inside buttons. The disclosure occupies the flexible
        middle; controls sit to the right as their own interactive
        elements.
      */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse runs" : "Expand runs"}
        >
          <Chevron className="size-4 shrink-0 text-tertiary" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h5 className="truncate text-body-sm-medium">{agent.name}</h5>
              {agent.has_api_key ? null : (
                <span className="rounded bg-layer-3 px-1.5 py-0.5 text-caption-sm-medium text-tertiary">no key</span>
              )}
              {!agent.is_enabled && (
                <span className="rounded bg-layer-3 px-1.5 py-0.5 text-caption-sm-medium text-tertiary">paused</span>
              )}
            </div>
            {agent.description && <p className="text-body-xs mt-0.5 truncate text-tertiary">{agent.description}</p>}
            <p className="text-caption-sm mt-0.5 truncate text-tertiary">{agent.bot_user_email}</p>
          </div>
        </button>
        <ToggleSwitch value={agent.is_enabled} onChange={handleToggle} disabled={busy} />
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="grid size-7 place-items-center rounded text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary disabled:opacity-50"
          aria-label="Delete agent"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-subtle bg-layer-1">
          <AgentRunsPanel workspaceSlug={workspaceSlug?.toString() ?? ""} agentId={agent.id} />
        </div>
      )}
    </div>
  );
}
