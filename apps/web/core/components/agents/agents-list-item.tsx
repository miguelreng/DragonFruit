/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { ToggleSwitch } from "@plane/ui";
// services
import type { TAgent } from "@/services/agent.service";
// local
import { Trash2 } from "@/components/icons/lucide-shim";

interface IAgentsListItemProps {
  agent: TAgent;
  onToggle: (id: string, next: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AgentsListItem({ agent, onToggle, onDelete }: IAgentsListItemProps) {
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex items-center gap-4 rounded-lg border border-subtle bg-layer-2 px-4 py-3">
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
      <div className="flex shrink-0 items-center gap-3">
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
    </div>
  );
}
