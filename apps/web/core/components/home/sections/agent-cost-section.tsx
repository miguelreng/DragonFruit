/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Sparkles } from "@/components/icons/lucide-shim";
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
    <section ref={sectionRef} id={SECTION_ID} className="flex scroll-mt-4 flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-tertiary" />
          <h3 className="text-14 font-semibold text-secondary">Agent cost</h3>
          {summary && summary.all_time.runs > 0 && (
            <span className="rounded-full bg-layer-2 px-1.5 py-px text-11 font-medium text-tertiary">
              {summary.all_time.runs} run{summary.all_time.runs === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      <div className="rounded-[18px] border border-subtle bg-surface-1">
        {!summary ? (
          <div className="px-3 py-6 text-center text-12 text-placeholder">Loading…</div>
        ) : !hasAnyRuns ? (
          <div className="px-3 py-6 text-center text-12 text-placeholder">
            No agent runs yet. Configure an agent and assign it to a task — costs will accumulate here.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 px-3 py-3 sm:grid-cols-4">
              <div>
                <div className="text-13 font-semibold text-secondary tabular-nums">
                  {formatUsd(summary.this_month.cost_usd)}
                </div>
                <div className="text-11 text-placeholder">this month</div>
              </div>
              <div>
                <div className="text-13 font-semibold text-secondary tabular-nums">
                  {formatUsd(summary.last_7_days.cost_usd)}
                </div>
                <div className="text-11 text-placeholder">last 7 days</div>
              </div>
              <div>
                <div className="text-13 font-semibold text-secondary tabular-nums">
                  {formatUsd(summary.all_time.cost_usd)}
                </div>
                <div className="text-11 text-placeholder">all time</div>
              </div>
              <div>
                <div className="text-13 font-semibold text-secondary tabular-nums">
                  {formatTokens(summary.all_time.total_tokens)}
                </div>
                <div className="text-11 text-placeholder">tokens all time</div>
              </div>
            </div>

            {summary.by_agent_last_30_days.length > 0 && (
              <div className="border-t border-subtle px-3 py-3">
                <div className="mb-2 text-11 font-medium text-placeholder uppercase">By agent · last 30 days</div>
                <ul className="flex flex-col gap-1.5">
                  {summary.by_agent_last_30_days.map((row) => {
                    const top = summary.by_agent_last_30_days[0]?.cost_usd ?? 0;
                    const width = top > 0 ? Math.max(4, Math.round((row.cost_usd / top) * 100)) : 4;
                    return (
                      <li key={row.agent_id} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 truncate text-13 text-secondary">{row.name}</span>
                        <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-layer-2">
                          <div className="bg-primary-100 h-full" style={{ width: `${width}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-11 font-medium text-placeholder tabular-nums">
                          {formatUsd(row.cost_usd)}
                        </span>
                        <span className="w-8 shrink-0 text-right text-11 font-medium text-placeholder tabular-nums">
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
      </div>
    </section>
  );
});
