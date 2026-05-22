/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Dev-only preview of the home Activity heatmap widget — no auth.
 * Seeded with mock data so the grid + stat cards can be inspected
 * without a workspace login. Remove this route once you have a real
 * dev account to log in with.
 */

import { ActivityHeatmapSection } from "@/components/home/sections/activity-heatmap-section";
import type { TActivityRange, TActivitySummary } from "@/services/home-preferences.service";

const RANGE_DAYS: Record<TActivityRange, number> = { all: 365, "30d": 30, "7d": 7 };

function buildMock(range: TActivityRange): TActivitySummary {
  const days = RANGE_DAYS[range];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: TActivitySummary["daily_buckets"] = [];

  // Deterministic pseudo-random so reloads don't reshuffle the grid.
  // Seed includes the range so each window gets a distinct pattern.
  let seed = 1 + days * 7919;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  let activeDays = 0;
  let docsTotal = 0;
  let tasksTotal = 0;
  let longest = 0;
  let run = 0;
  let current = 0;
  let currentBroken = false;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    // Bias: weekends are quieter, last 30 days more active.
    const dow = d.getDay();
    const recencyBoost = i < 30 ? 1.4 : i < 90 ? 1.1 : 0.85;
    const weekendDamp = dow === 0 || dow === 6 ? 0.4 : 1;
    const base = rand() * 6 * recencyBoost * weekendDamp;
    const count = Math.random() < 0.15 ? 0 : Math.max(0, Math.round(base));
    const docs = Math.round(count * (0.4 + rand() * 0.4));
    const work_items = Math.max(0, count - docs);
    buckets.push({ date: d.toISOString().slice(0, 10), docs, work_items, count });
    if (count > 0) {
      activeDays += 1;
      docsTotal += docs;
      tasksTotal += work_items;
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  // Current streak — walk backwards from today.
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (buckets[i].count > 0) {
      if (!currentBroken) current += 1;
    } else if (i === buckets.length - 1) {
      // empty today — keep walking
      continue;
    } else {
      currentBroken = true;
    }
  }

  const hour_buckets = Array.from({ length: 24 }, (_, h) => {
    // Bias activity to mid-morning and late evening.
    const bias = h >= 9 && h <= 12 ? 5 : h >= 19 && h <= 23 ? 4 : 1;
    return { hour: h, count: Math.round(rand() * 30 * bias) };
  });

  return {
    range,
    since: buckets[0].date,
    until: buckets[buckets.length - 1].date,
    totals: {
      items: docsTotal + tasksTotal,
      docs: docsTotal,
      work_items: tasksTotal,
    },
    active_days: activeDays,
    current_streak: current,
    longest_streak: longest,
    peak_hour: 23,
    top_type: docsTotal >= tasksTotal ? "docs" : "work_items",
    daily_buckets: buckets,
    hour_buckets,
  };
}

export default function ActivityPreviewPage() {
  return (
    <div className="min-h-screen bg-surface-1 p-6">
      <div className="mx-auto max-w-[800px]">
        <h1 className="mb-4 text-13 font-medium text-placeholder">Dev preview — Activity widget (mock data)</h1>
        <ActivityHeatmapSection previewBuilder={buildMock} />
      </div>
    </div>
  );
}
