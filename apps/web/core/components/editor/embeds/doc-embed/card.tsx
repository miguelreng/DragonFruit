/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ExternalLink, ListChecks, Loader2, PenTool, StickyNote } from "@/components/icons/lucide-shim";
import type { IProjectView, TPage, TSticky } from "@plane/types";
import { EViewAccess } from "@plane/types";
import { cn } from "@plane/utils";
import { STICKY_COLORS_LIST } from "@/components/editor/sticky-editor/color-palette";
import { ProjectPageService } from "@/services/page";
import { StickyService } from "@/services/sticky.service";
import { ViewService } from "@/services/view.service";

const pageService = new ProjectPageService();
const stickyService = new StickyService();
const viewService = new ViewService();

type Props = {
  embedType: "whiteboard" | "sticky" | "task_view";
  entityId: string;
  projectId: string | undefined;
  workspaceSlug: string | undefined;
  title?: string;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "ready"; page?: TPage; sticky?: TSticky; view?: IProjectView };

const stripHtml = (html?: string) =>
  (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function DocEmbedCard(props: Props) {
  const { embedType, entityId, projectId, workspaceSlug, title } = props;
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    if (!workspaceSlug || !entityId) return;
    if ((embedType === "whiteboard" || embedType === "task_view") && !projectId) return;
    let cancelled = false;
    setState({ status: "loading" });
    const load = async () => {
      try {
        if (embedType === "whiteboard") {
          const page = await pageService.fetchById(workspaceSlug, projectId!, entityId, false);
          if (!cancelled) setState({ status: "ready", page });
        } else if (embedType === "sticky") {
          const sticky = await stickyService.getSticky(workspaceSlug, entityId);
          if (!cancelled) setState({ status: "ready", sticky });
        } else {
          const view = await viewService.getViewDetails(workspaceSlug, projectId!, entityId);
          if (!cancelled) setState({ status: "ready", view });
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [embedType, entityId, projectId, workspaceSlug]);

  const meta = useMemo(() => {
    if (embedType === "whiteboard") {
      const page = state.status === "ready" ? state.page : undefined;
      return {
        label: "Whiteboard",
        Icon: PenTool,
        name: page?.name || title || "Untitled whiteboard",
        href: workspaceSlug && projectId ? `/${workspaceSlug}/projects/${projectId}/pages/${entityId}` : undefined,
        body: "Canvas page",
      };
    }
    if (embedType === "sticky") {
      const sticky = state.status === "ready" ? state.sticky : undefined;
      return {
        label: "Sticky",
        Icon: StickyNote,
        name: sticky?.name || title || "Untitled sticky",
        href: workspaceSlug ? `/${workspaceSlug}/stickies` : undefined,
        body: stripHtml(sticky?.description_html) || "Note",
      };
    }
    const view = state.status === "ready" ? state.view : undefined;
    return {
      label: "Task view",
      Icon: ListChecks,
      name: view?.name || title || "Untitled task view",
      href: workspaceSlug && projectId ? `/${workspaceSlug}/projects/${projectId}/views/${entityId}` : undefined,
      body: view?.access === EViewAccess.PRIVATE ? "Private saved view" : "Saved task view",
    };
  }, [embedType, entityId, projectId, state, title, workspaceSlug]);

  if (!workspaceSlug || !entityId) return <EmbedFallback>Embedded content — missing identifiers</EmbedFallback>;
  if (state.status === "error")
    return <EmbedFallback>Embedded {meta.label.toLowerCase()} is unavailable</EmbedFallback>;

  const isLoading = state.status === "idle" || state.status === "loading";
  if (embedType === "sticky") {
    const sticky = state.status === "ready" ? state.sticky : undefined;
    return (
      <StickyEmbedCard
        href={meta.href}
        isLoading={isLoading}
        title={sticky?.name || title || "Untitled sticky"}
        description={sticky?.description_html}
        backgroundColorKey={sticky?.background_color}
      />
    );
  }

  const Icon = meta.Icon;
  const shell = (
    <div
      className={cn(
        "not-prose group flex w-full items-center gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 px-4 py-3 shadow-raised-100 transition-colors hover:border-strong hover:bg-surface-2"
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-subtle bg-layer-1 text-tertiary">
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="tracking-normal text-11 font-medium text-tertiary uppercase">{meta.label}</span>
          {meta.href && (
            <ExternalLink className="size-3 text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
        <div className="mt-0.5 truncate text-14 font-medium text-primary">{meta.name}</div>
        <div className="mt-0.5 truncate text-12 text-secondary">{isLoading ? "Loading…" : meta.body}</div>
      </div>
    </div>
  );

  return meta.href ? (
    <Link to={meta.href} className="block no-underline">
      {shell}
    </Link>
  ) : (
    shell
  );
}

function StickyEmbedCard({
  backgroundColorKey,
  description,
  href,
  isLoading,
  title,
}: {
  backgroundColorKey?: string | null;
  description?: string;
  href?: string;
  isLoading: boolean;
  title: string;
}) {
  const backgroundColor =
    STICKY_COLORS_LIST.find((color) => color.key === backgroundColorKey)?.backgroundColor ||
    STICKY_COLORS_LIST[0].backgroundColor;
  const body = stripHtml(description);

  const shell = (
    <div
      className="not-prose group/sticky shadow-sm hover:shadow-md relative flex min-h-[180px] w-full max-w-md flex-col overflow-hidden rounded-sm px-4 pt-5 pb-4 ring-1 ring-black/5 transition-[box-shadow,transform,filter] duration-200 ease-out hover:-translate-y-0.5"
      style={{ backgroundColor }}
    >
      <div className="content-title-font line-clamp-2 text-20 font-medium text-primary">
        {isLoading ? "Loading sticky..." : title}
      </div>
      <div className="mt-3 line-clamp-6 text-14 leading-6 whitespace-pre-wrap text-primary">
        {isLoading ? "" : body || "Click to type here"}
      </div>
    </div>
  );

  return href ? (
    <Link to={href} className="inline-block max-w-full no-underline">
      {shell}
    </Link>
  ) : (
    shell
  );
}

function EmbedFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose rounded-md border-[0.5px] border-subtle bg-surface-1 px-4 py-3 text-13 text-secondary">
      {children}
    </div>
  );
}
