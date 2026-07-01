/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import type { IIssueLabel } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ATLAS_IDENTITY } from "@/constants/atlas";
import { AgentService, type TAgent } from "@/services/agent.service";
import {
  WorkflowService,
  type TWorkflow,
  type TWorkflowEdge,
  type TWorkflowNode,
} from "@/services/workflow.service";
import { IssueLabelService } from "@/services/issue/issue_label.service";
import { ProjectService } from "@/services/project/project.service";
import type { TPartialProject } from "@/plane-web/types";
import { PanelRight } from "@/components/icons/lucide-shim";
import { BuilderToolbar } from "./builder-toolbar";
import { FlowCanvas } from "./flow-canvas";
import { WorkflowInspector } from "./inspector";
import { WorkflowActivity } from "./activity-view";
import { newNodeId, placeChild, starterGraph } from "./builder-helpers";
import type { TWorkflowView } from "./types";

const workflowService = new WorkflowService();
const agentService = new AgentService();
const projectService = new ProjectService();
const issueLabelService = new IssueLabelService();

const getAtlasProfile = (agents: TAgent[]): TAgent | undefined =>
  // oxlint-disable-next-line no-array-sort
  [...agents].sort((a, b) => {
    if (a.is_enabled !== b.is_enabled) return a.is_enabled ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];

type TGraph = {
  currentId: string | null;
  name: string;
  enabled: boolean;
  nodes: TWorkflowNode[];
  edges: TWorkflowEdge[];
};

const graphFromWorkflow = (w: TWorkflow): TGraph => ({
  currentId: w.id,
  name: w.name,
  enabled: w.is_enabled,
  nodes: w.nodes.map((n) => ({ ...n })),
  edges: w.edges.map((e) => ({ ...e })),
});

const draftGraph = (): TGraph => {
  const { nodes, edges } = starterGraph();
  return { currentId: null, name: "", enabled: true, nodes, edges };
};

const errorTitle = (err: unknown, fallback: string) =>
  (err as { error?: string } | undefined)?.error ?? fallback;

function WorkflowsRootBase() {
  const params = useParams();
  const workspaceSlug = String(params?.workspaceSlug ?? "");

  const { data: workflows, mutate } = useSWR<TWorkflow[]>(
    workspaceSlug ? `WORKFLOWS_${workspaceSlug}` : null,
    workspaceSlug ? () => workflowService.list(workspaceSlug) : null
  );
  const { data: agents } = useSWR<TAgent[]>(
    workspaceSlug ? `WORKFLOWS_AGENTS_${workspaceSlug}` : null,
    workspaceSlug ? () => agentService.list(workspaceSlug) : null
  );
  const { data: projects } = useSWR<TPartialProject[]>(
    workspaceSlug ? `WORKFLOWS_PROJECTS_${workspaceSlug}` : null,
    workspaceSlug ? () => projectService.getProjectsLite(workspaceSlug) : null
  );
  const { data: labels } = useSWR<IIssueLabel[]>(
    workspaceSlug ? `WORKFLOWS_LABELS_${workspaceSlug}` : null,
    workspaceSlug ? () => issueLabelService.getWorkspaceIssueLabels(workspaceSlug) : null
  );

  const atlasAgent = agents ? getAtlasProfile(agents) : undefined;
  const agentName = atlasAgent?.name ?? ATLAS_IDENTITY.name;
  const connectedApps = (atlasAgent?.mcp_servers ?? []).filter((s) => s.enabled);

  const [graph, setGraph] = useState<TGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [view, setView] = useState<TWorkflowView>("build");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);

  // Seed once workflows load: open the first workflow, else a fresh draft.
  useEffect(() => {
    if (initialized.current || !workflows) return;
    initialized.current = true;
    const g = workflows.length ? graphFromWorkflow(workflows[0]) : draftGraph();
    setGraph(g);
    setSelectedNodeId(g.nodes.find((n) => n.kind === "trigger")?.id ?? null);
  }, [workflows]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [graph, selectedNodeId]
  );

  const loadWorkflow = (w: TWorkflow) => {
    const g = graphFromWorkflow(w);
    setGraph(g);
    setSelectedNodeId(g.nodes.find((n) => n.kind === "trigger")?.id ?? null);
    setDirty(false);
  };

  const selectWorkflow = (id: string) => {
    const w = (workflows ?? []).find((x) => x.id === id);
    if (w) loadWorkflow(w);
  };

  const startNew = () => {
    const g = draftGraph();
    setGraph(g);
    setSelectedNodeId(g.nodes.find((n) => n.kind === "trigger")?.id ?? null);
    setDirty(true);
  };

  const selectNode = (id: string) => {
    setSelectedNodeId(id);
    setInspectorOpen(true);
  };

  // Graph mutations
  const moveNode = (id: string, x: number, y: number) =>
    setGraph((g) => (g ? { ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) } : g));

  const addChild = (parentId: string, branch: "" | "true" | "false", kind: "condition" | "action") => {
    setGraph((g) => {
      if (!g) return g;
      const parent = g.nodes.find((n) => n.id === parentId);
      if (!parent) return g;
      const pos = placeChild(parent, branch);
      const node: TWorkflowNode = {
        id: newNodeId(),
        kind,
        config: kind === "condition" ? { filters: {} } : { type: "ask_atlas", params: {} },
        x: pos.x,
        y: pos.y,
      };
      const edge: TWorkflowEdge = { from_node: parentId, to_node: node.id, branch };
      setSelectedNodeId(node.id);
      setInspectorOpen(true);
      return { ...g, nodes: [...g.nodes, node], edges: [...g.edges, edge] };
    });
    setDirty(true);
  };

  const changeConfig = (config: Record<string, unknown>) => {
    if (!selectedNodeId) return;
    setGraph((g) =>
      g ? { ...g, nodes: g.nodes.map((n) => (n.id === selectedNodeId ? { ...n, config } : n)) } : g
    );
    setDirty(true);
  };

  const deleteSelected = () => {
    if (!selectedNodeId || !graph) return;
    const node = graph.nodes.find((n) => n.id === selectedNodeId);
    if (!node || node.kind === "trigger") return;
    setGraph((g) =>
      g
        ? {
            ...g,
            nodes: g.nodes.filter((n) => n.id !== selectedNodeId),
            edges: g.edges.filter((e) => e.from_node !== selectedNodeId && e.to_node !== selectedNodeId),
          }
        : g
    );
    setSelectedNodeId(graph.nodes.find((n) => n.kind === "trigger")?.id ?? null);
    setDirty(true);
  };

  const changeName = (name: string) => {
    setGraph((g) => (g ? { ...g, name } : g));
    setDirty(true);
  };
  const toggleEnabled = (next: boolean) => {
    setGraph((g) => (g ? { ...g, enabled: next } : g));
    setDirty(true);
  };

  const save = async () => {
    if (!graph) return;
    setSaving(true);
    try {
      const payload = {
        name: graph.name.trim() || "Untitled workflow",
        agent: atlasAgent?.id ?? null,
        is_enabled: graph.enabled,
        nodes: graph.nodes.map((n) => ({ id: n.id, kind: n.kind, config: n.config, x: n.x, y: n.y })),
        edges: graph.edges.map((e) => ({ from_node: e.from_node, to_node: e.to_node, branch: e.branch })),
      };
      const saved = graph.currentId
        ? await workflowService.update(workspaceSlug, graph.currentId, payload)
        : await workflowService.create(workspaceSlug, payload);
      await mutate();
      loadWorkflow(saved); // re-sync to server-issued node ids
      setToast({ type: TOAST_TYPE.SUCCESS, title: graph.currentId ? "Workflow saved" : "Workflow created" });
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: errorTitle(err, "Could not save workflow") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!graph?.currentId) return;
    if (!window.confirm(`Delete workflow "${graph.name || "Untitled"}"?`)) return;
    try {
      await workflowService.destroy(workspaceSlug, graph.currentId);
      const next = await mutate();
      const remaining = next ?? [];
      if (remaining.length) loadWorkflow(remaining[0]);
      else startNew();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Workflow deleted" });
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: errorTitle(err, "Could not delete workflow") });
    }
  };

  const test = async () => {
    if (!graph?.currentId) return;
    const issueId = window.prompt("Task ID to test this workflow on:");
    if (!issueId) return;
    try {
      await workflowService.test(workspaceSlug, graph.currentId, { issue_id: issueId.trim() });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Test run queued" });
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: errorTitle(err, "Could not queue test run") });
    }
  };

  if (!graph) {
    return (
      <div className="grid h-full w-full place-items-center">
        <span className="text-13 text-tertiary">Loading workflows…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <BuilderToolbar
        workflows={workflows ?? []}
        currentId={graph.currentId}
        name={graph.name}
        enabled={graph.enabled}
        dirty={dirty}
        saving={saving}
        view={view}
        onChangeView={setView}
        onChangeName={changeName}
        onSelectWorkflow={selectWorkflow}
        onNew={startNew}
        onToggleEnabled={toggleEnabled}
        onSave={save}
        onDelete={remove}
        onTest={test}
      />
      {view === "build" ? (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <FlowCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            agentName={agentName}
            selectedId={selectedNodeId}
            onSelect={selectNode}
            onMoveNode={moveNode}
            onAddChild={addChild}
          />
          <WorkflowInspector
            open={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            node={selectedNode}
            agentName={agentName}
            connectedApps={connectedApps}
            projects={projects ?? []}
            labels={labels ?? []}
            workspaceSlug={workspaceSlug}
            onChangeConfig={changeConfig}
            onDelete={deleteSelected}
          />
          {!inspectorOpen && (
            <button
              type="button"
              onClick={() => setInspectorOpen(true)}
              className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-subtle bg-layer-1 px-2.5 py-1.5 text-12 font-medium text-secondary shadow-sm t-press hover:bg-layer-2"
            >
              <PanelRight className="size-4" />
              Details
            </button>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <WorkflowActivity workspaceSlug={workspaceSlug} workflowId={graph.currentId} />
        </div>
      )}
    </div>
  );
}

export const WorkflowsRoot = observer(WorkflowsRootBase);
