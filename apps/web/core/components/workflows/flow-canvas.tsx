/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bolt } from "@solar-icons/react/ssr";
import { cn } from "@plane/utils";
import { ListFilter, Sparkles, Plus, Minus, Maximize } from "@/components/icons/lucide-shim";
import type { TWorkflowEdge, TWorkflowNode, TWorkflowNodeKind } from "@/services/workflow.service";
import { FlowNode } from "./flow-node";
import { nodeDisplay, nodeKindLabel, NODE_W } from "./builder-helpers";

type AddKind = "condition" | "action";
type Branch = "" | "true" | "false";

type Props = {
  nodes: TWorkflowNode[];
  edges: TWorkflowEdge[];
  agentName: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onAddChild: (parentId: string, branch: Branch, kind: AddKind) => void;
};

type XY = { x: number; y: number };

const EST_H = 90;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
const DOTTED_BG = {
  backgroundImage: "radial-gradient(rgba(120,120,120,0.18) 1px, transparent 1px)",
  backgroundSize: "16px 16px",
} as const;
const EDGE_STROKE = "rgba(120,120,120,0.55)";

const kindIcon = (kind: TWorkflowNodeKind): ReactNode => {
  if (kind === "trigger") return <Bolt weight="Bold" className="size-3.5" />;
  if (kind === "condition") return <ListFilter className="size-3.5" />;
  return <Sparkles className="size-3.5" />;
};

export function FlowCanvas({ nodes, edges, agentName, selectedId, onSelect, onMoveNode, onAddChild }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<XY>({ x: 0, y: 0 });
  const [addMenu, setAddMenu] = useState<{ parentId: string; branch: Branch; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const cw = containerRef.current?.clientWidth ?? 0;
    if (cw) setPan({ x: Math.round(cw / 2 - 620), y: 12 });
  }, []);

  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  const h = (id: string) => heights[id] ?? EST_H;
  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  const edgePaths = useMemo(
    () =>
      edges
        .map((e) => {
          const a = nodeById[e.from_node];
          const b = nodeById[e.to_node];
          if (!a || !b) return null;
          const x1 = a.x + NODE_W / 2;
          const y1 = a.y + h(a.id);
          const x2 = b.x + NODE_W / 2;
          const y2 = b.y;
          const my = (y1 + y2) / 2;
          return {
            key: e.id ?? `${e.from_node}-${e.to_node}-${e.branch}`,
            d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`,
            label: e.branch === "true" ? "If True" : e.branch === "false" ? "If False" : "",
            lx: (x1 + x2) / 2,
            ly: my,
          };
        })
        .filter(Boolean) as Array<{ key: string; d: string; label: string; lx: number; ly: number }>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, nodeById, heights]
  );

  // Which "add child" (+) slots each node should show — branches without an edge yet.
  const addSlots = useMemo(() => {
    const slots: Array<{ parentId: string; branch: Branch; x: number; y: number }> = [];
    for (const n of nodes) {
      const outBranches = edges.filter((e) => e.from_node === n.id).map((e) => e.branch);
      const cx = n.x + NODE_W / 2;
      const by = n.y + h(n.id) + 18;
      if (n.kind === "condition") {
        if (!outBranches.includes("true")) slots.push({ parentId: n.id, branch: "true", x: cx - 60, y: by });
        if (!outBranches.includes("false")) slots.push({ parentId: n.id, branch: "false", x: cx + 60, y: by });
      } else if (outBranches.length === 0) {
        slots.push({ parentId: n.id, branch: "", x: cx, y: by });
      }
    }
    return slots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, heights]);

  const resetView = () => {
    setZoom(1);
    const cw = containerRef.current?.clientWidth ?? 0;
    setPan({ x: Math.round(cw / 2 - 620), y: 12 });
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden" style={DOTTED_BG}>
      <PanLayer pan={pan} setPan={setPan} onBackgroundClick={() => setAddMenu(null)}>
        <div
          className="absolute left-0 top-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          <svg width={2600} height={1800} className="pointer-events-none absolute left-0 top-0 overflow-visible">
            <defs>
              <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto">
                <path d="M1,1 L5,4 L1,7" fill="none" stroke={EDGE_STROKE} strokeWidth="1.25" />
              </marker>
            </defs>
            {edgePaths.map((e) => (
              <path key={e.key} d={e.d} fill="none" stroke={EDGE_STROKE} strokeWidth={1.5} markerEnd="url(#wf-arrow)" />
            ))}
          </svg>

          {edgePaths
            .filter((e) => e.label)
            .map((e) => (
              <span
                key={`${e.key}-label`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-subtle bg-layer-1 px-2 py-0.5 text-11 font-medium text-tertiary"
                style={{ left: e.lx, top: e.ly }}
              >
                {e.label}
              </span>
            ))}

          {nodes.map((n) => {
            const d = nodeDisplay(n, agentName);
            return (
              <CanvasNode
                key={n.id}
                pos={{ x: n.x, y: n.y }}
                zoom={zoom}
                onDragTo={(x, y) => onMoveNode(n.id, x, y)}
                onSelect={() => onSelect(n.id)}
                onMeasure={(height) =>
                  setHeights((prev) => (prev[n.id] === height ? prev : { ...prev, [n.id]: height }))
                }
              >
                <FlowNode
                  kind={n.kind}
                  icon={kindIcon(n.kind)}
                  kindLabel={nodeKindLabel(n.kind)}
                  title={d.title}
                  subtitle={d.subtitle}
                  selected={selectedId === n.id}
                />
              </CanvasNode>
            );
          })}

          {/* Add-child (+) slots */}
          {addSlots.map((s) => (
            <button
              key={`${s.parentId}-${s.branch}`}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setAddMenu({ parentId: s.parentId, branch: s.branch, x: s.x, y: s.y });
              }}
              className="absolute grid size-6 -translate-x-1/2 place-items-center rounded-full border border-subtle bg-layer-1 text-tertiary shadow-sm t-press hover:bg-layer-2 hover:text-primary"
              style={{ left: s.x, top: s.y }}
              aria-label="Add step"
            >
              <Plus className="size-3.5" />
            </button>
          ))}

          {/* Add-step type menu */}
          {addMenu && (
            <div
              className="absolute z-20 w-36 -translate-x-1/2 overflow-hidden rounded-lg border border-subtle bg-layer-1 py-1 shadow-lg"
              style={{ left: addMenu.x, top: addMenu.y + 16 }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {(["condition", "action"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChild(addMenu.parentId, addMenu.branch, k);
                    setAddMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-13 text-secondary hover:bg-layer-2"
                >
                  <span className="grid size-4 place-items-center text-tertiary">{kindIcon(k)}</span>
                  {nodeKindLabel(k)}
                </button>
              ))}
            </div>
          )}
        </div>
      </PanLayer>

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-subtle bg-layer-1 px-1.5 py-1 shadow-md">
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
          className="grid size-6 place-items-center rounded-md text-tertiary t-press hover:bg-layer-3"
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
        <span className="min-w-[3rem] text-center text-12 font-medium text-secondary tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          className="grid size-6 place-items-center rounded-md text-tertiary t-press hover:bg-layer-3"
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-strong/40" />
        <button
          type="button"
          onClick={resetView}
          className="grid size-6 place-items-center rounded-md text-tertiary t-press hover:bg-layer-3"
          aria-label="Reset view"
        >
          <Maximize className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Drags the whole world when the empty canvas background is pressed. */
function PanLayer({
  pan,
  setPan,
  onBackgroundClick,
  children,
}: {
  pan: XY;
  setPan: (xy: XY) => void;
  onBackgroundClick: () => void;
  children: ReactNode;
}) {
  const drag = useRef({ active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  return (
    <div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={(e) => {
        drag.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const dstate = drag.current;
        if (!dstate.active) return;
        if (Math.abs(e.clientX - dstate.sx) + Math.abs(e.clientY - dstate.sy) > 3) dstate.moved = true;
        setPan({ x: dstate.ox + (e.clientX - dstate.sx), y: dstate.oy + (e.clientY - dstate.sy) });
      }}
      onPointerUp={(e) => {
        if (drag.current.active && !drag.current.moved) onBackgroundClick();
        drag.current.active = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }}
    >
      {children}
    </div>
  );
}

/** A draggable, selectable node wrapper. A press without movement = select. */
function CanvasNode({
  pos,
  zoom,
  onDragTo,
  onSelect,
  onMeasure,
  children,
}: {
  pos: XY;
  zoom: number;
  onDragTo: (x: number, y: number) => void;
  onSelect: () => void;
  onMeasure: (height: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    onMeasure(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => onMeasure(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => {
        e.stopPropagation();
        drag.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const dstate = drag.current;
        if (!dstate.active) return;
        if (Math.abs(e.clientX - dstate.sx) + Math.abs(e.clientY - dstate.sy) > 4) dstate.moved = true;
        onDragTo(dstate.ox + (e.clientX - dstate.sx) / zoom, dstate.oy + (e.clientY - dstate.sy) / zoom);
      }}
      onPointerUp={(e) => {
        if (drag.current.active && !drag.current.moved) onSelect();
        drag.current.active = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }}
    >
      {children}
    </div>
  );
}
