/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { ToggleSwitch } from "@plane/ui";
// services
import type { TAgent } from "@/services/agent.service";
// local
import { ChevronDown, ChevronRight, Settings2, Trash2 } from "@/components/icons/lucide-shim";
import { AgentAvatar } from "./agent-avatar";
import { AgentRunsPanel } from "./agent-runs-panel";

export type TAgentTriggerKey = keyof TAgent["triggers"];

interface IAgentsListItemProps {
  agent: TAgent;
  onToggle: (id: string, next: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (agent: TAgent) => void;
  onUpdateTrigger: (id: string, key: TAgentTriggerKey, next: boolean) => Promise<void>;
}

// Owner-facing copy for each trigger. The keys match `TAgent["triggers"]`
// (issue_created / assigned / mentioned / state_change / comment). Order is the order the
// triggers render in.
const TRIGGER_LABELS: Array<{ key: TAgentTriggerKey; title: string; description: string }> = [
  {
    key: "issue_created",
    title: "When a task is created",
    description: "Auto-triage new tasks with a first-pass plan and next actions.",
  },
  {
    key: "assigned",
    title: "When assigned to a task",
    description: "Reply when this agent is added as an assignee.",
  },
  {
    key: "mentioned",
    title: "When @-mentioned",
    description: "Reply when someone @-mentions this agent in a task description or comment.",
  },
  {
    key: "state_change",
    title: "When the task state changes",
    description: "Reply when an assigned task's state is updated.",
  },
  {
    key: "comment",
    title: "On any new comment",
    description: "Reply to every new comment on an assigned task. Noisy — opt in carefully.",
  },
];

export function AgentsListItem({ agent, onToggle, onDelete, onEdit, onUpdateTrigger }: IAgentsListItemProps) {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Per-trigger busy state so toggling one doesn't disable the others.
  const [busyTrigger, setBusyTrigger] = useState<TAgentTriggerKey | null>(null);

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
    const confirmed = window.confirm(t("workspace_settings.settings.agents.delete_confirm", { name: agent.name }));
    if (!confirmed) return;
    setBusy(true);
    try {
      await onDelete(agent.id);
    } finally {
      setBusy(false);
    }
  };

  const handleTriggerToggle = async (key: TAgentTriggerKey) => {
    if (busyTrigger) return;
    setBusyTrigger(key);
    try {
      await onUpdateTrigger(agent.id, key, !agent.triggers?.[key]);
    } finally {
      setBusyTrigger(null);
    }
  };

  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="overflow-hidden bg-layer-2">
      {/*
        Layout note: the disclosure trigger (the row) and the controls
        (toggle + delete) are siblings, not nested — HTML doesn't allow
        buttons inside buttons. The disclosure occupies the flexible
        middle; controls sit to the right as their own interactive
        elements.
      */}
      {/*
        Matches the SettingsBoxedControlItem rhythm used on the AI page:
        title + description on the left, controls block on the right. The
        whole left column is a single button that toggles the expand
        disclosure — we keep the chevron at the far right of the title so
        the row's affordance is clear without an avatar prefix.
      */}
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse agent" : "Expand agent"}
        >
          <AgentAvatar seed={agent.id} name={agent.name} src={agent.avatar_url} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-body-sm-medium text-primary">{agent.name}</h4>
              {agent.has_api_key ? null : (
                <Pill variant={EPillVariant.DEFAULT} size={EPillSize.XS}>
                  {t("workspace_settings.settings.agents.badge.no_key")}
                </Pill>
              )}
              {!agent.is_enabled && (
                <Pill variant={EPillVariant.WARNING} size={EPillSize.XS}>
                  {t("workspace_settings.settings.agents.badge.paused")}
                </Pill>
              )}
              <Chevron className="size-3.5 shrink-0 text-tertiary" />
            </div>
            {(agent.description || agent.bot_user_email) && (
              <p className="truncate text-caption-md-regular text-tertiary">
                {agent.description || agent.bot_user_email}
              </p>
            )}
          </div>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(agent)}
            disabled={busy}
            className="grid size-7 place-items-center rounded text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary disabled:opacity-50"
            aria-label="Configure agent"
          >
            <Settings2 className="size-4" />
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
      </div>
      {expanded && (
        <div className="border-t border-subtle bg-layer-1">
          <div className="px-4 py-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h6 className="text-body-sm-medium">Triggers</h6>
              <p className="text-caption-sm-regular text-tertiary">What events make {agent.name} reply.</p>
            </div>
            <ul className="flex flex-col gap-1 rounded-md border border-subtle bg-layer-2">
              {TRIGGER_LABELS.map(({ key, title, description }, idx) => {
                const value = !!agent.triggers?.[key];
                return (
                  <li
                    key={key}
                    className={`flex items-start justify-between gap-3 px-3 py-2.5 ${
                      idx > 0 ? "border-t border-subtle" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-body-xs-medium text-secondary">{title}</p>
                      <p className="mt-0.5 text-caption-sm-regular text-tertiary">{description}</p>
                    </div>
                    <ToggleSwitch
                      value={value}
                      onChange={() => handleTriggerToggle(key)}
                      disabled={busyTrigger !== null && busyTrigger !== key}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
          <AgentRunsPanel workspaceSlug={workspaceSlug?.toString() ?? ""} agentId={agent.id} />
        </div>
      )}
    </div>
  );
}
