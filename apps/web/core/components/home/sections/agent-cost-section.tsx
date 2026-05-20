/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// services
import { AgentService, type TAgentCostSummary } from "@/services/agent.service";

const SECTION_ID = "agent_cost";

const agentService = new AgentService();

function formatUsd(n: number): string {
  if (!n) return "$0.00";
  if (n < 0.01) return "<$0.01";
  if (n < 1) return `$${n.toFixed(3)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n)}`;
}

function formatTokens(n: number): string {
  if (!n) return "0";
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export const AgentCostSection = observer(function AgentCostSection() {
  const { workspaceSlug } = useParams();
  const sectionRef = useRef<HTMLElement>(null);

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

  const { data: summary } = useSWR<TAgentCostSummary>(
    workspaceSlug ? `AGENT_COST_SUMMARY_${workspaceSlug}` : null,
    workspaceSlug ? () => agentService.costSummary(workspaceSlug.toString()) : null,
    {
      // Refresh every 30s — agents are usually low-frequency so we don't
      // need to be more aggressive than that, and the home page may have
      // several other polling widgets open in parallel.
      refreshInterval: 30_000,
      revalidateOnFocus: true,
    }
  );

  const allTimeRuns = summary?.all_time.runs ?? 0;
  const hasAnyRuns = allTimeRuns > 0;

  return (
    <section ref={sectionRef} id={SECTION_ID} className="rounded-lg border border-subtle bg-layer-1 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-body-md-medium text-primary">Agent cost</h3>
        {summary && (
          <span className="text-caption-md text-tertiary">
            {summary.all_time.runs} run{summary.all_time.runs === 1 ? "" : "s"} all time
          </span>
        )}
      </header>

      {!summary ? (
        <div className="text-caption-md py-6 text-tertiary">Loading…</div>
      ) : !hasAnyRuns ? (
        <div className="text-caption-md py-6 text-tertiary">
          No agent runs yet. Configure an agent and assign it to a task — costs will accumulate here.
        </div>
      ) : (
        <>
          {/* Headline: this-month spend with secondary context. */}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <div className="text-display-sm-medium text-primary tabular-nums">
                {formatUsd(summary.this_month.cost_usd)}
              </div>
              <div className="text-caption-md text-tertiary">this month</div>
            </div>
            <div>
              <div className="text-body-md-medium text-secondary tabular-nums">
                {formatUsd(summary.last_7_days.cost_usd)}
              </div>
              <div className="text-caption-md text-tertiary">last 7 days</div>
            </div>
            <div>
              <div className="text-body-md-medium text-secondary tabular-nums">
                {formatUsd(summary.all_time.cost_usd)}
              </div>
              <div className="text-caption-md text-tertiary">all time</div>
            </div>
            <div>
              <div className="text-body-md-medium text-secondary tabular-nums">
                {formatTokens(summary.all_time.total_tokens)}
              </div>
              <div className="text-caption-md text-tertiary">tokens all time</div>
            </div>
          </div>

          {summary.by_agent_last_30_days.length > 0 && (
            <div className="mt-4 border-t border-subtle pt-3">
              <div className="mb-2 text-caption-md-medium text-secondary">By agent (last 30 days)</div>
              <ul className="flex flex-col gap-1">
                {summary.by_agent_last_30_days.map((row) => {
                  // Bar width relative to the top spender.
                  const top = summary.by_agent_last_30_days[0]?.cost_usd ?? 0;
                  const width = top > 0 ? Math.max(4, Math.round((row.cost_usd / top) * 100)) : 4;
                  return (
                    <li key={row.agent_id} className="flex items-center gap-3">
                      <span className="text-body-sm w-32 shrink-0 truncate text-secondary">{row.name}</span>
                      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-layer-3">
                        <div className="bg-primary-100 h-full" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-caption-md w-20 shrink-0 text-right text-tertiary tabular-nums">
                        {formatUsd(row.cost_usd)}
                      </span>
                      <span className="text-caption-md w-10 shrink-0 text-right text-tertiary tabular-nums">
                        {row.runs}×
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
});
