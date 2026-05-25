/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Activity } from "@/components/icons/lucide-shim";
import {
  HomePreferencesService,
  type TActivityRange,
  type TActivitySummary,
} from "@/services/home-preferences.service";

const SECTION_ID = "activity";

// The grid renders a fixed recent window so it fits inside the home card
// without horizontal scroll. 20 weeks (~4–5 months) matches the reference
// layout and leaves headroom on narrower viewports / when the workspace
// sidebar is open.
const VISIBLE_WEEKS = 20;
const VISIBLE_DAYS = VISIBLE_WEEKS * 7;
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const service = new HomePreferencesService();

type Tab = "overview" | "by_type";

const RANGE_LABELS: Record<TActivityRange, string> = {
  all: "All",
  "30d": "30d",
  "7d": "7d",
};

function formatHour(h: number | null): string {
  if (h === null || h === undefined) return "—";
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function intensityClass(count: number, max: number, dim = false): string {
  // `bg-layer-1` is the neutral-200 token — a subtle off-card swatch
  // for empty days. `bg-layer-2` is pure white and would disappear
  // against the surrounding card surface.
  if (count === 0) return "bg-layer-1";
  const ratio = max > 0 ? count / max : 0;
  // Four-step ramp on the brand color. The floor is /55 (not /30) so a
  // single-entry day pops against the empty `bg-layer-1` cells — on a
  // workspace with only a handful of records, the lit cells would
  // otherwise disappear into the grid.
  if (dim) return "bg-accent-primary/50";
  if (ratio > 0.66) return "bg-accent-primary";
  if (ratio > 0.33) return "bg-accent-primary/80";
  return "bg-accent-primary/55";
}

type GridCell = { date: string; count: number; docs: number; work_items: number } | null;
type RenderGridCell = { key: string; cell: GridCell };

/**
 * Pack the daily buckets into a `weeks x 7` grid (rows = weekdays Sun..Sat,
 * cols = weeks oldest -> newest). The newest column is right-aligned and
 * may include empty trailing cells for the days after `today` in its week.
 */
function buildGrid(buckets: TActivitySummary["daily_buckets"]): GridCell[][] {
  if (buckets.length === 0) return [];
  const first = new Date(`${buckets[0].date}T00:00:00`);
  const startDow = first.getDay(); // 0..6
  const cells: GridCell[] = Array.from({ length: startDow }, () => null);
  for (const b of buckets) {
    cells.push({ date: b.date, count: b.count, docs: b.docs, work_items: b.work_items });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = cells.length / 7;
  // Reshape into [week][dow]
  const grid: GridCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const week: GridCell[] = [];
    for (let d = 0; d < 7; d++) week.push(cells[w * 7 + d]);
    grid.push(week);
  }
  return grid;
}

function getRenderWeekCells(week: GridCell[], weekKey: string): RenderGridCell[] {
  return week.map((cell, dayIndex) => ({
    key: cell?.date ?? `${weekKey}-${WEEKDAY_KEYS[dayIndex]}`,
    cell,
  }));
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-subtle bg-surface-1 px-3 py-2.5">
      <div className="text-11 font-medium text-placeholder">{label}</div>
      <div className="text-15 mt-0.5 font-semibold text-primary tabular-nums">{value}</div>
    </div>
  );
}

type ActivityHeatmapSectionProps = {
  /**
   * Dev/preview-only override. Called with the section's current range
   * each render; when provided, the section renders the returned
   * payload instead of hitting the API. Used by the standalone preview
   * route so the widget can be inspected without a workspace login.
   */
  previewBuilder?: (range: TActivityRange) => TActivitySummary;
};

export const ActivityHeatmapSection = observer(function ActivityHeatmapSection({
  previewBuilder,
}: ActivityHeatmapSectionProps = {}) {
  const { workspaceSlug } = useParams();
  const sectionRef = useRef<HTMLElement>(null);
  const [range, setRange] = useState<TActivityRange>("all");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const scrollIfTargeted = () => {
      if (window.location.hash === `#${SECTION_ID}`) {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    scrollIfTargeted();
    window.addEventListener("hashchange", scrollIfTargeted);
    return () => window.removeEventListener("hashchange", scrollIfTargeted);
  }, []);

  // Always fetch the full "all" payload — the grid stays at the 52-week
  // layout regardless of which range pill is active. The range only
  // narrows what the stat cards, streaks, and fun-fact line summarize.
  const { data: fetched } = useSWR<TActivitySummary>(
    !previewBuilder && workspaceSlug ? `ACTIVITY_SUMMARY_${workspaceSlug}` : null,
    !previewBuilder && workspaceSlug ? () => service.activitySummary(workspaceSlug.toString(), "all") : null,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    }
  );
  const previewSummary = useMemo(() => (previewBuilder ? previewBuilder("all") : undefined), [previewBuilder]);
  const fullSummary = previewSummary ?? fetched;

  // Stats derived from the selected window. Grid always reads from
  // `fullSummary.daily_buckets` so the layout is stable.
  const summary = useMemo<TActivitySummary | undefined>(() => {
    if (!fullSummary) return undefined;
    if (range === "all") return fullSummary;
    const days = range === "7d" ? 7 : 30;
    const sliced = fullSummary.daily_buckets.slice(-days);
    let docs = 0;
    let work_items = 0;
    let active = 0;
    let longest = 0;
    let run = 0;
    for (const b of sliced) {
      docs += b.docs;
      work_items += b.work_items;
      if (b.count > 0) {
        active += 1;
        run += 1;
        longest = Math.max(longest, run);
      } else {
        run = 0;
      }
    }
    let current = 0;
    for (let i = sliced.length - 1; i >= 0; i--) {
      if (sliced[i].count > 0) current += 1;
      else if (i !== sliced.length - 1) break;
    }
    return {
      ...fullSummary,
      range,
      since: sliced[0]?.date ?? fullSummary.since,
      totals: { items: docs + work_items, docs, work_items },
      active_days: active,
      current_streak: current,
      longest_streak: longest,
      top_type: docs >= work_items ? "docs" : "work_items",
    };
  }, [fullSummary, range]);

  // Choose which series the grid colors are driven by. Overview = total;
  // By type = whichever type the user filters to (default: top type).
  const [typeFocus, setTypeFocus] = useState<"docs" | "work_items">("docs");
  useEffect(() => {
    if (summary?.top_type) setTypeFocus(summary.top_type);
  }, [summary?.top_type]);

  const visibleBuckets = useMemo(() => (summary?.daily_buckets ?? []).slice(-VISIBLE_DAYS), [summary?.daily_buckets]);
  const grid = useMemo(() => buildGrid(visibleBuckets), [visibleBuckets]);
  const maxCount = useMemo(() => {
    if (visibleBuckets.length === 0) return 0;
    if (tab === "overview") return Math.max(0, ...visibleBuckets.map((b) => b.count));
    return Math.max(0, ...visibleBuckets.map((b) => (typeFocus === "docs" ? b.docs : b.work_items)));
  }, [visibleBuckets, tab, typeFocus]);

  const funFact = useMemo(() => {
    if (!summary) return null;
    const t = summary.totals.items;
    if (t === 0) return null;
    if (t === 1) return "First entry logged — the streak begins.";
    if (summary.current_streak >= 3) return `You're on a ${summary.current_streak}-day streak. Keep the momentum.`;
    if (summary.totals.docs > summary.totals.work_items * 2)
      return "You write more than you ticket — a doc-first workspace.";
    if (summary.totals.work_items > summary.totals.docs * 2)
      return "Heavy on tasks, light on docs. Consider writing one down.";
    return `${formatNumber(t)} entries across ${summary.active_days} active days.`;
  }, [summary]);

  return (
    <section ref={sectionRef} id={SECTION_ID} className="flex scroll-mt-4 flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-tertiary" />
          <h3 className="text-14 font-semibold text-secondary">Activity</h3>
        </div>
      </div>

      <div className="rounded-[18px] border border-subtle bg-surface-1">
        {/* Header row: tabs left, range filter right */}
        <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
          <div className="flex items-center gap-1">
            {(["overview", "by_type"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={
                  "rounded-md px-2 py-1 text-12 font-medium transition-colors " +
                  (tab === t ? "bg-layer-2 text-primary" : "text-placeholder hover:text-secondary")
                }
              >
                {t === "overview" ? "Overview" : "By type"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(["all", "30d", "7d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={
                  "rounded-md px-2 py-1 text-12 font-medium tabular-nums transition-colors " +
                  (range === r ? "bg-layer-2 text-primary" : "text-placeholder hover:text-secondary")
                }
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {!summary ? (
          <div className="px-3 py-8 text-center text-12 text-placeholder">Loading…</div>
        ) : (
          <div className="flex flex-col gap-3 px-3 py-3">
            {tab === "by_type" && (
              <div className="flex items-center gap-1">
                {(["docs", "work_items"] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTypeFocus(tf)}
                    className={
                      "rounded-full border px-2.5 py-0.5 text-11 font-medium transition-colors " +
                      (typeFocus === tf
                        ? "border-accent-strong bg-accent-primary/10 text-accent-primary"
                        : "border-subtle text-placeholder hover:text-secondary")
                    }
                  >
                    {tf === "docs" ? "Docs" : "Tasks"}
                    <span className="ml-1.5 text-placeholder tabular-nums">
                      {tf === "docs" ? summary.totals.docs : summary.totals.work_items}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard
                label={tab === "overview" ? "Entries" : typeFocus === "docs" ? "Docs" : "Tasks"}
                value={formatNumber(
                  tab === "overview"
                    ? summary.totals.items
                    : typeFocus === "docs"
                      ? summary.totals.docs
                      : summary.totals.work_items
                )}
              />
              <StatCard label="Active days" value={summary.active_days.toString()} />
              <StatCard label="Current streak" value={`${summary.current_streak}d`} />
              <StatCard label="Longest streak" value={`${summary.longest_streak}d`} />
              <StatCard label="Peak hour" value={formatHour(summary.peak_hour)} />
              <StatCard label="Docs" value={formatNumber(summary.totals.docs)} />
              <StatCard label="Tasks" value={formatNumber(summary.totals.work_items)} />
              <StatCard label="Top type" value={summary.top_type === "docs" ? "Docs" : "Tasks"} />
            </div>

            {/* Heatmap renders a fixed recent window (VISIBLE_WEEKS) and
                stretches edge-to-edge inside the card. Each week column is
                `flex-1` so they divide the available width evenly, and
                cells use `aspect-square` so they grow/shrink with the
                viewport while staying perfectly square. */}
            {grid.length > 0 && (
              <div className="min-w-0 overflow-hidden pt-1">
                <div className="flex w-full gap-[3px]">
                  {grid.map((week) => {
                    const weekKey = week.find((cell) => cell)?.date ?? "empty-week";
                    return (
                      <div key={weekKey} className="flex flex-1 flex-col gap-[3px]">
                        {getRenderWeekCells(week, weekKey).map(({ key, cell }) => {
                          if (!cell) return <div key={key} className="aspect-square w-full" />;
                          const value =
                            tab === "overview" ? cell.count : typeFocus === "docs" ? cell.docs : cell.work_items;
                          return (
                            <div
                              key={key}
                              title={`${cell.date} — ${value} ${value === 1 ? "entry" : "entries"}`}
                              className={"aspect-square w-full rounded-[3px] " + intensityClass(value, maxCount)}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {funFact && <div className="border-t border-subtle pt-2 text-11 text-placeholder">{funFact}</div>}
          </div>
        )}
      </div>
    </section>
  );
});
