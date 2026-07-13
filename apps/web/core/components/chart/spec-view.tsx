/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { useTheme } from "next-themes";
// plane imports
import { CHART_COLOR_PALETTES } from "@plane/constants";
import { AreaChart } from "@plane/propel/charts/area-chart";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { LineChart } from "@plane/propel/charts/line-chart";
import { PieChart } from "@plane/propel/charts/pie-chart";
import type { TAreaItem, TBarItem, TCellItem, TChartLegend, TLineItem } from "@plane/types";
// local imports
import type { TChartSpec } from "./spec";
import { generateExtendedColors } from "./utils";

/**
 * Renders a portable `TChartSpec` (see ./spec.ts) with the propel chart
 * components. This is the single renderer behind every chart surface —
 * chat bubbles today, doc embeds and sheet charts next — so it stays
 * self-contained: it resolves its own theme palette and needs only a spec.
 *
 * Note: propel charts pull in recharts (~100KB). Import this lazily from
 * always-mounted surfaces (the chat drawer does) so it stays off the
 * critical path.
 */

type Props = {
  spec: TChartSpec;
  /** pixel height of the plot area (the wrapper is width: 100%) */
  height?: number;
  className?: string;
};

/** Series are keyed positionally ("s0".."s5") in the recharts data rows. */
const seriesKey = (index: number) => `s${index}`;

const DEFAULT_LEGEND: TChartLegend = { align: "center", verticalAlign: "bottom", layout: "horizontal" };
const AXIS_MARGIN = { top: 8, right: 12, bottom: 4, left: 0 };

export const ChartSpecView = React.memo(function ChartSpecView(props: Props) {
  const { spec, height = 224, className } = props;
  const { resolvedTheme } = useTheme();

  const stacked = !!spec.options?.stacked;
  const showLegend = spec.options?.legend ?? (spec.series.length > 1 || spec.type === "pie" || spec.type === "donut");
  const legend = showLegend ? DEFAULT_LEGEND : undefined;

  // Themed palette, extended to cover series (axis charts) or slices (pie).
  const { seriesColors, sliceColors } = useMemo(() => {
    const base = CHART_COLOR_PALETTES[0]?.[resolvedTheme === "dark" ? "dark" : "light"] ?? [];
    const extended = generateExtendedColors(base, Math.max(spec.series.length, spec.labels.length));
    return {
      seriesColors: spec.series.map((s, i) => s.color ?? extended[i % extended.length]),
      sliceColors: spec.labels.map((_, i) => extended[i % extended.length]),
    };
  }, [resolvedTheme, spec.labels, spec.series]);

  // One row per label; each series contributes a positional key.
  const rows = useMemo(
    () =>
      spec.labels.map((label, labelIndex) => {
        const row: Record<string, string | number> = { name: label };
        spec.series.forEach((s, index) => {
          row[seriesKey(index)] = s.values[labelIndex] ?? 0;
        });
        return row;
      }),
    [spec.labels, spec.series]
  );

  const hasDecimals = useMemo(
    () => spec.series.some((s) => s.values.some((value) => !Number.isInteger(value))),
    [spec.series]
  );

  const xAxis = { key: "name", label: spec.options?.xLabel };
  const yAxis = { key: seriesKey(0), label: spec.options?.yLabel, allowDecimals: hasDecimals };

  const chart = useMemo(() => {
    switch (spec.type) {
      case "bar": {
        const bars: TBarItem<string>[] = spec.series.map((s, index) => ({
          key: seriesKey(index),
          label: s.name,
          stackId: stacked ? "stack" : seriesKey(index),
          fill: seriesColors[index],
          textClassName: "",
          showPercentage: false,
          showTopBorderRadius: () => (stacked ? index === spec.series.length - 1 : true),
          showBottomBorderRadius: () => (stacked ? index === 0 : true),
        }));
        // Keep grouped bars from overflowing narrow containers (chat bubbles).
        const groupCount = spec.labels.length * (stacked ? 1 : spec.series.length);
        const barSize = Math.max(6, Math.min(28, Math.floor(280 / Math.max(groupCount, 1))));
        return (
          <BarChart
            className="size-full"
            data={rows}
            bars={bars}
            xAxis={xAxis}
            yAxis={yAxis}
            barSize={barSize}
            margin={AXIS_MARGIN}
            legend={legend}
            isAnimationActive={false}
          />
        );
      }
      case "line": {
        const lines: TLineItem<string>[] = spec.series.map((s, index) => ({
          key: seriesKey(index),
          label: s.name,
          fill: seriesColors[index],
          stroke: seriesColors[index],
          dashedLine: false,
          showDot: spec.labels.length <= 16,
          smoothCurves: true,
        }));
        return (
          <LineChart
            className="size-full"
            data={rows}
            lines={lines}
            xAxis={xAxis}
            yAxis={yAxis}
            margin={AXIS_MARGIN}
            legend={legend}
            isAnimationActive={false}
          />
        );
      }
      case "area": {
        const areas: TAreaItem<string>[] = spec.series.map((s, index) => ({
          key: seriesKey(index),
          label: s.name,
          stackId: stacked ? "stack" : seriesKey(index),
          fill: seriesColors[index],
          fillOpacity: 0.2,
          showDot: false,
          smoothCurves: true,
          strokeColor: seriesColors[index],
          strokeOpacity: 1,
        }));
        return (
          <AreaChart
            className="size-full"
            data={rows}
            areas={areas}
            xAxis={xAxis}
            yAxis={yAxis}
            margin={AXIS_MARGIN}
            legend={legend}
            isAnimationActive={false}
          />
        );
      }
      case "pie":
      case "donut": {
        // Pie ignores extra series; slices come from the first. Negative
        // slice values are meaningless — clamp so recharts doesn't glitch.
        const pieRows = spec.labels.map((label, index) => ({
          key: label,
          name: label,
          count: Math.max(0, spec.series[0]?.values[index] ?? 0),
        }));
        const cells: TCellItem<string>[] = pieRows.map((row, index) => ({
          key: row.key,
          fill: sliceColors[index],
        }));
        const donut = spec.type === "donut";
        return (
          <PieChart
            className="size-full"
            data={pieRows}
            dataKey="count"
            cells={cells}
            showLabel={false}
            innerRadius={donut ? "55%" : 0}
            outerRadius="85%"
            cornerRadius={donut ? 4 : 0}
            paddingAngle={donut ? 2 : 0}
            margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
            legend={legend}
            isAnimationActive={false}
          />
        );
      }
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, rows, seriesColors, sliceColors, stacked, legend, hasDecimals]);

  if (!chart) return null;

  return (
    <div className={className}>
      {spec.title && <p className="mb-1.5 truncate text-13 font-semibold text-primary">{spec.title}</p>}
      <div
        // Serif at 600 across plot text; legend items pin their own font-medium
        // so they need the targeted bump. Tooltips stay body-font at normal weight.
        className="[&_.recharts-tooltip-wrapper]:font-normal w-full font-serif font-semibold [&_.recharts-legend-wrapper_div]:font-semibold [&_.recharts-tooltip-wrapper]:font-body"
        style={{ height }}
      >
        {chart}
      </div>
    </div>
  );
});
ChartSpecView.displayName = "ChartSpecView";
