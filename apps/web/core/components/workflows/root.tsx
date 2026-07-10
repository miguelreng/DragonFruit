/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import type { IIssueLabel, ISearchIssueResponse, TProjectIssuesSearchParams } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ATLAS_IDENTITY } from "@/constants/atlas";
import { AgentService, type TAgent } from "@/services/agent.service";
import { WorkflowService, type TWorkflow, type TWorkflowEdge, type TWorkflowNode } from "@/services/workflow.service";
import { IssueLabelService } from "@/services/issue/issue_label.service";
import { ProjectService } from "@/services/project/project.service";
import type { TPartialProject } from "@/plane-web/types";
import { Breadcrumbs, Header } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { PanelRight, Plus } from "@/components/icons/lucide-shim";
import { AppHeader } from "@/components/core/app-header";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { BuilderToolbar } from "./builder-toolbar";
import { FlowCanvas } from "./flow-canvas";
import { WorkflowInspector } from "./inspector";
import { WorkflowActivity } from "./activity-view";
import { WorkflowGallery } from "./workflow-gallery";
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

const errorTitle = (err: unknown, fallback: string) => (err as { error?: string } | undefined)?.error ?? fallback;

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
  const [mode, setMode] = useState<"gallery" | "builder">("gallery");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);

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

  const startNew = () => {
    const g = draftGraph();
    setGraph(g);
    setSelectedNodeId(g.nodes.find((n) => n.kind === "trigger")?.id ?? null);
    setDirty(true);
  };

  // Gallery navigation
  const openWorkflow = (id: string) => {
    const w = (workflows ?? []).find((x) => x.id === id);
    if (!w) return;
    loadWorkflow(w);
    setView("build");
    setMode("builder");
  };
  const newFromGallery = () => {
    startNew();
    setView("build");
    setMode("builder");
  };
  const backToGallery = () => {
    setMode("gallery");
    void mutate();
  };
  const toggleCard = async (id: string, next: boolean) => {
    try {
      await workflowService.update(workspaceSlug, id, { is_enabled: next });
      await mutate();
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: errorTitle(err, "Could not update workflow") });
    }
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
      // Nudge down until the spot is clear of existing nodes (roughly one card).
      const overlaps = (y: number) => g.nodes.some((n) => Math.abs(n.x - pos.x) < 240 && Math.abs(n.y - y) < 110);
      while (overlaps(pos.y)) pos.y += 120;
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
    setGraph((g) => (g ? { ...g, nodes: g.nodes.map((n) => (n.id === selectedNodeId ? { ...n, config } : n)) } : g));
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

  const deleteEdge = (edge: { from_node: string; to_node: string; branch: string }) => {
    setGraph((g) =>
      g
        ? {
            ...g,
            edges: g.edges.filter(
              (e) => !(e.from_node === edge.from_node && e.to_node === edge.to_node && e.branch === edge.branch)
            ),
          }
        : g
    );
    setDirty(true);
  };

  const connectNodes = (fromId: string, toId: string, branch: "" | "true" | "false") => {
    if (!graph) return;
    const from = graph.nodes.find((n) => n.id === fromId);
    const to = graph.nodes.find((n) => n.id === toId);
    if (!from || !to) return;
    const fail = (title: string) => setToast({ type: TOAST_TYPE.ERROR, title });
    if (to.kind === "trigger") return fail("Triggers can’t have incoming connections");
    if (graph.edges.some((e) => e.from_node === fromId && e.to_node === toId))
      return fail("These steps are already connected");
    const outBranches = graph.edges.filter((e) => e.from_node === fromId).map((e) => e.branch);
    if (from.kind === "condition" && outBranches.includes(branch))
      return fail(`The ${branch === "true" ? "If True" : "If False"} branch is already connected`);
    if (from.kind !== "condition" && outBranches.length > 0) return fail("This step already continues to another step");
    // Reject cycles: if `from` is reachable from `to`, this edge closes a loop.
    const reachable = new Set<string>();
    const stack = [toId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      for (const e of graph.edges) if (e.from_node === cur) stack.push(e.to_node);
    }
    if (reachable.has(fromId)) return fail("That connection would create a loop");
    setGraph((g) => (g ? { ...g, edges: [...g.edges, { from_node: fromId, to_node: toId, branch }] } : g));
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

  const save = async ({ notify = true }: { notify?: boolean } = {}): Promise<TWorkflow | null> => {
    if (!graph) return null;
    const wasExisting = !!graph.currentId;
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
      if (notify) setToast({ type: TOAST_TYPE.SUCCESS, title: wasExisting ? "Workflow saved" : "Workflow created" });
      return saved;
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: errorTitle(err, "Could not save workflow") });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const openTestPicker = async () => {
    if (!graph || saving) return;
    if (!graph.currentId || dirty) {
      const saved = await save({ notify: false });
      if (!saved?.id) return;
    }
    setTestModalOpen(true);
  };

  const remove = async () => {
    if (!graph?.currentId) return;
    if (!window.confirm(`Delete workflow "${graph.name || "Untitled"}"?`)) return;
    try {
      await workflowService.destroy(workspaceSlug, graph.currentId);
      await mutate();
      setMode("gallery");
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Workflow deleted" });
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: errorTitle(err, "Could not delete workflow") });
    }
  };

  const runTestOn = async (selected: ISearchIssueResponse[]) => {
    const workflowId = graph?.currentId;
    if (!workflowId || selected.length === 0) return;
    try {
      await Promise.all(
        selected.map((issue) => workflowService.test(workspaceSlug, workflowId, { issue_id: issue.id }))
      );
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: selected.length === 1 ? "Test run queued" : `${selected.length} test runs queued`,
      });
      setView("activity");
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: errorTitle(err, "Could not queue test run") });
    }
  };

  // Workspace-wide task search for the Test picker. The search endpoint is
  // project-scoped in its URL, so bind any project and force workspace_search.
  const testSearchCallback = (query: TProjectIssuesSearchParams) => {
    const anyProjectId = (projects ?? [])[0]?.id;
    if (!anyProjectId) return Promise.resolve([] as ISearchIssueResponse[]);
    return projectService.projectIssuesSearch(workspaceSlug, anyProjectId, { ...query, workspace_search: true });
  };

  // Docs-pattern chrome: the root owns its AppHeader — breadcrumb + count on
  // the left, the create CTA on the right (never inside the grid).
  const galleryHeader = (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-1.5">
          <Breadcrumbs>
            <Breadcrumbs.Item component={<BreadcrumbLink label="Workflows" disableTooltip />} />
          </Breadcrumbs>
          <span className="rounded-full bg-layer-1 px-1.5 py-px text-11 font-medium text-tertiary">
            {(workflows ?? []).length}
          </span>
        </div>
      </Header.LeftItem>
      <Header.RightItem className="items-center">
        <Button variant="primary" size="lg" prependIcon={<Plus className="size-4" />} onClick={newFromGallery}>
          New workflow
        </Button>
      </Header.RightItem>
    </Header>
  );

  const builderHeader = (
    <Header>
      <Header.LeftItem className="min-w-0">
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <button
                type="button"
                onClick={backToGallery}
                className="text-13 font-medium text-tertiary hover:text-primary"
              >
                Workflows
              </button>
            }
          />
          <Breadcrumbs.Item
            component={
              <div className="content-title-font inline-flex min-w-0 items-center">
                <input
                  type="text"
                  value={graph?.name ?? ""}
                  onChange={(e) => changeName(e.target.value)}
                  maxLength={255}
                  placeholder="Untitled workflow"
                  aria-label="Workflow name"
                  className="h-6 w-[min(42vw,320px)] min-w-0 bg-transparent text-14 font-semibold text-primary outline-none placeholder:text-placeholder"
                />
              </div>
            }
          />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );

  if (mode === "gallery") {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden">
        <AppHeader header={galleryHeader} />
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <WorkflowGallery
            workflows={workflows ?? []}
            loading={!workflows}
            onOpen={openWorkflow}
            onToggle={toggleCard}
          />
        </div>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="grid h-full w-full place-items-center">
        <span className="text-13 text-tertiary">Loading workflows…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <AppHeader header={builderHeader} />
      <BuilderToolbar
        currentId={graph.currentId}
        enabled={graph.enabled}
        dirty={dirty}
        saving={saving}
        view={view}
        onChangeView={setView}
        onToggleEnabled={toggleEnabled}
        onSave={() => void save()}
        onDelete={remove}
        onTest={openTestPicker}
      />
      <ExistingIssuesListModal
        workspaceSlug={workspaceSlug}
        isOpen={testModalOpen}
        handleClose={() => setTestModalOpen(false)}
        searchParams={{}}
        handleOnSubmit={runTestOn}
        workItemSearchServiceCallback={testSearchCallback}
        title="Run a test — pick the task the workflow should act on"
        submitLabel="Run test"
      />
      {agents && !atlasAgent && (
        <div className="bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-2 border-b border-subtle px-4 py-1.5 text-12">
          <span className="min-w-0 flex-1 truncate">
            Atlas isn’t set up in this workspace — Ask Atlas and task actions won’t run until it is.
          </span>
          <Link href={`/${workspaceSlug}/settings/ai`} className="shrink-0 font-medium underline underline-offset-2">
            Set up in Settings → AI
          </Link>
        </div>
      )}
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
            onDeleteEdge={deleteEdge}
            onConnect={connectNodes}
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
              className="shadow-sm t-press absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg border border-subtle bg-layer-1 px-2.5 py-1.5 text-12 font-medium text-secondary hover:bg-layer-2"
            >
              <PanelRight className="size-4" />
              Details
            </button>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <WorkflowActivity
            workspaceSlug={workspaceSlug}
            workflowId={graph.currentId}
            nodes={graph.nodes}
            agentName={agentName}
          />
        </div>
      )}
    </div>
  );
}

export const WorkflowsRoot = observer(WorkflowsRootBase);
