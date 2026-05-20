/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import type { TPageInstance } from "@/store/pages/base-page";
import type { TPageRootHandlers } from "../editor/page-root";

// React Flow ships its base styles separately. Lazy-load JS + CSS together so
// non-diagram pages don't pay for either, then expose a thin wrapper that
// includes Background / MiniMap / Controls.
const FlowCanvas = lazy(async () => {
  const [mod] = await Promise.all([import("@xyflow/react"), import("@xyflow/react/dist/style.css")]);
  const { ReactFlow, Background, MiniMap, Controls } = mod;
  // reason: function must close over the dynamically-imported components
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, unicorn/consistent-function-scoping
  const Wrapped = (props: any) => (
    <ReactFlow {...props}>
      <Background gap={16} size={1} />
      <MiniMap pannable zoomable className="!bg-surface-1" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
  return { default: Wrapped };
});

type FlowNode = {
  id: string;
  position: { x: number; y: number };
  data: { label: string };
  type?: string;
};

type FlowEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
};

type FlowScene = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
};

type FlowInstance = {
  screenToFlowPosition: (xy: { x: number; y: number }) => { x: number; y: number };
  getViewport: () => { x: number; y: number; zoom: number };
};

function extractScene(page: TPageInstance): FlowScene {
  const raw = (page.description_json ?? {}) as { flow?: FlowScene };
  const scene = raw.flow;
  if (!scene || !Array.isArray(scene.nodes) || !Array.isArray(scene.edges)) {
    // First open (or legacy page): seed one centered node so the canvas isn't
    // visually empty.
    return {
      nodes: [
        {
          id: "n1",
          position: { x: 0, y: 0 },
          data: { label: "Start" },
          type: "default",
        },
      ],
      edges: [],
    };
  }
  return scene;
}

const PALETTE: Array<{ type: "input" | "default" | "output"; label: string; description: string }> = [
  { type: "input", label: "Start", description: "Entry point" },
  { type: "default", label: "Step", description: "Generic step" },
  { type: "output", label: "End", description: "Terminal node" },
];

type Props = {
  page: TPageInstance;
  handlers: TPageRootHandlers;
  isEditable: boolean;
};

export const DiagramEditor = observer(function DiagramEditor({ page, handlers, isEditable }: Props) {
  const flowRef = useRef<FlowInstance | null>(null);
  const initialSceneRef = useRef<FlowScene | null>(null);
  if (initialSceneRef.current === null) {
    initialSceneRef.current = extractScene(page);
  }

  const [nodes, setNodes] = useState<FlowNode[]>(initialSceneRef.current.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(initialSceneRef.current.edges);

  // Diagram pages skip the doc Yjs provider; mark synced on mount so the
  // header badge clears, then drive transitions ourselves around each save.
  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

  const persist = useMemo(
    () =>
      debounce((nextNodes: FlowNode[], nextEdges: FlowEdge[]) => {
        page.setSyncingStatus("syncing");
        const viewport = flowRef.current?.getViewport();
        handlers
          .updateDescription({
            description_json: {
              flow: { nodes: nextNodes, edges: nextEdges, viewport },
            },
          })
          .then(() => page.setSyncingStatus("synced"))
          .catch((e) => {
            console.error("diagram save failed", e);
            page.setSyncingStatus("error");
          });
      }, 700),
    [handlers, page]
  );

  // Bridge React Flow's change events into our state. The change shape comes
  // from @xyflow/react but importing the type would defeat the lazy chunk, so
  // we treat it as opaque and implement a minimal reducer below.
  const applyNodeChanges = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (changes: any[]) => {
      setNodes((current) => {
        const next = reduceNodeChanges(current, changes);
        persist(next, edges);
        return next;
      });
    },
    [edges, persist]
  );

  const applyEdgeChanges = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (changes: any[]) => {
      setEdges((current) => {
        const next = reduceEdgeChanges(current, changes);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist]
  );

  const handleConnect = useCallback(
    (params: { source: string | null; target: string | null }) => {
      if (!params.source || !params.target) return;
      const id = `e-${params.source}-${params.target}-${Math.random().toString(36).slice(2, 7)}`;
      setEdges((current) => {
        const next: FlowEdge[] = [...current, { id, source: params.source!, target: params.target! }];
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/dragonfruit-flow-node");
      const label = event.dataTransfer.getData("application/dragonfruit-flow-label");
      if (!type || !flowRef.current) return;
      const position = flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = `n-${Math.random().toString(36).slice(2, 8)}`;
      setNodes((current) => {
        const next: FlowNode[] = [...current, { id, position, data: { label: label || "Untitled" }, type }];
        persist(next, edges);
        return next;
      });
    },
    [edges, persist]
  );

  const handleNodeDoubleClick = useCallback(
    (_event: unknown, node: FlowNode) => {
      if (!isEditable) return;
      const nextLabel = window.prompt("Rename node", node.data.label);
      if (nextLabel === null) return;
      setNodes((current) => {
        const next = current.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, label: nextLabel } } : n));
        persist(next, edges);
        return next;
      });
    },
    [edges, isEditable, persist]
  );

  return (
    <div className="relative flex h-full w-full">
      {isEditable && <PalettePanel />}
      <div className="relative h-full flex-1" onDragOver={handleDragOver} onDrop={handleDrop}>
        <Suspense
          fallback={
            <div className="text-sm flex h-full w-full items-center justify-center text-tertiary">Loading diagram…</div>
          }
        >
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={applyNodeChanges}
            onEdgesChange={applyEdgeChanges}
            onConnect={handleConnect}
            onNodeDoubleClick={handleNodeDoubleClick}
            onInit={(instance: FlowInstance) => {
              flowRef.current = instance;
            }}
            fitView
            nodesDraggable={isEditable}
            nodesConnectable={isEditable}
            elementsSelectable={isEditable}
            proOptions={{ hideAttribution: true }}
          />
        </Suspense>
      </div>
    </div>
  );
});

function PalettePanel() {
  return (
    <aside className="z-10 flex h-full w-44 flex-col gap-2 border-r border-subtle bg-surface-1 p-3">
      <div className="text-11 font-medium tracking-wide text-tertiary uppercase">Drag to canvas</div>
      <ul className="flex flex-col gap-1.5">
        {PALETTE.map((item) => (
          <li
            key={item.type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/dragonfruit-flow-node", item.type);
              e.dataTransfer.setData("application/dragonfruit-flow-label", item.label);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="cursor-grab rounded-md border border-subtle bg-canvas px-3 py-2 text-12 text-primary select-none hover:border-strong active:cursor-grabbing"
            aria-label={`${item.label}: ${item.description}`}
          >
            <div className="leading-tight font-medium">{item.label}</div>
            <div className="text-11 text-tertiary">{item.description}</div>
          </li>
        ))}
      </ul>
      <p className="mt-auto text-11 text-tertiary">
        Drag handles between nodes to connect. Double-click a node to rename it.
      </p>
    </aside>
  );
}

// --- Local change reducers (mirror @xyflow/react's applyNodeChanges /
// applyEdgeChanges closely enough for our state shape, without needing to
// eagerly import the package).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reduceNodeChanges(current: FlowNode[], changes: any[]): FlowNode[] {
  let next = current;
  for (const change of changes) {
    if (change.type === "position" && change.position) {
      next = next.map((n) => (n.id === change.id ? { ...n, position: change.position } : n));
    } else if (change.type === "remove") {
      next = next.filter((n) => n.id !== change.id);
    } else if (change.type === "add" && change.item) {
      next = [...next, change.item];
    } else if (change.type === "replace" && change.item) {
      next = next.map((n) => (n.id === change.id ? change.item : n));
    }
    // Ignore "select" / "dimensions" — they don't affect persisted state and
    // would cause an autosave on every focus or resize observer tick.
  }
  return next;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reduceEdgeChanges(current: FlowEdge[], changes: any[]): FlowEdge[] {
  let next = current;
  for (const change of changes) {
    if (change.type === "remove") {
      next = next.filter((e) => e.id !== change.id);
    } else if (change.type === "add" && change.item) {
      next = [...next, change.item];
    } else if (change.type === "replace" && change.item) {
      next = next.map((e) => (e.id === change.id ? change.item : e));
    }
  }
  return next;
}
