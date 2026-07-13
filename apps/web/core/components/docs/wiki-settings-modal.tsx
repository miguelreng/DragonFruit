/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { EPageAccess } from "@plane/constants";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage } from "@plane/types";
import { DropIndicator, EModalPosition, EModalWidth, ModalCore, ToggleSwitch } from "@plane/ui";
import { cn, copyUrlToClipboard, getPageName } from "@plane/utils";
import { Copy, Eye, EyeOff, FileText, Link, Monitor, Moon, Sun, X } from "@/components/icons/lucide-shim";
import {
  buildPublicPagePath,
  buildPublicPageUrl,
  normalizePublicPageSlug,
  validatePublicPageSlug,
} from "@/helpers/page-public";
import {
  DEFAULT_WIKI_ACCENT,
  getWikiViewProps,
  WIKI_ACCENTS,
  type TWikiAccentKey,
  type TWikiThemeKey,
} from "@/helpers/wiki-appearance";
import { ProjectPageService } from "@/services/page/project-page.service";

const pageService = new ProjectPageService();

type Props = {
  workspaceSlug: string;
  folder: TPage;
  /** The folder's child docs (unfiltered). */
  docs: TPage[];
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type TThemeChoice = "auto" | TWikiThemeKey;

const THEME_CHOICES: { key: TThemeChoice; label: string; icon: typeof Monitor }[] = [
  { key: "auto", label: "System theme", icon: Monitor },
  { key: "light", label: "Light theme", icon: Sun },
  { key: "dark", label: "Dark theme", icon: Moon },
];

const sortDocsByWikiOrder = (docs: TPage[], order: string[] | undefined) => {
  // No saved order yet: mirror the public reader's default (creation order).
  if (!order?.length)
    return [...docs].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...docs].sort((a, b) => (rank.get(a.id ?? "") ?? order.length) - (rank.get(b.id ?? "") ?? order.length));
};

export function WikiSettingsModal({ workspaceSlug, folder, docs, isOpen, onClose, onSaved }: Props) {
  const wikiProps = useMemo(() => getWikiViewProps(folder.view_props), [folder.view_props]);
  const savedSlug =
    typeof folder.view_props?.public_slug === "string" ? (folder.view_props.public_slug as string) : "";

  // "Create wiki" opens this modal for an unpublished folder: same controls,
  // but the flow reads as creation — publish defaults ON so saving mints the
  // wiki from the folder's existing docs.
  const isCreateFlow = folder.access !== EPageAccess.PUBLIC;
  const [isPublished, setIsPublished] = useState(true);
  const [wikiName, setWikiName] = useState(getPageName(folder.name));
  const [slug, setSlug] = useState(savedSlug);
  const [orderedDocs, setOrderedDocs] = useState<TPage[]>(() => sortDocsByWikiOrder(docs, wikiProps.order));
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set(wikiProps.hidden ?? []));
  const [accent, setAccent] = useState<TWikiAccentKey>(wikiProps.accent ?? DEFAULT_WIKI_ACCENT);
  const [theme, setTheme] = useState<TThemeChoice>(wikiProps.theme ?? "auto");
  const [isSaving, setIsSaving] = useState(false);
  // "form" is the editable view; "published" is the post-create success view
  // (shown once when a save takes the folder live).
  const [phase, setPhase] = useState<"form" | "published">("form");
  // Sliding indicator for the theme switcher — same motion as tab switching.
  const themeGroupRef = useRef<HTMLDivElement>(null);
  const [themePill, setThemePill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!isOpen || phase !== "form") return;
    const active = themeGroupRef.current?.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (!active) return;
    setThemePill({ left: active.offsetLeft, width: active.offsetWidth });
  }, [isOpen, phase, theme]);

  // Re-seed local state each time the modal opens for a (possibly different) folder.
  useEffect(() => {
    if (!isOpen) return;
    setIsPublished(true);
    setWikiName(getPageName(folder.name));
    setSlug(savedSlug);
    setOrderedDocs(sortDocsByWikiOrder(docs, wikiProps.order));
    setHiddenIds(new Set(wikiProps.hidden ?? []));
    setAccent(wikiProps.accent ?? DEFAULT_WIKI_ACCENT);
    setTheme(wikiProps.theme ?? "auto");
    setIsSaving(false);
    setPhase("form");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, folder.id]);

  const publicSlug = normalizePublicPageSlug(slug) || folder.id || "";
  const publicUrl = buildPublicPageUrl(workspaceSlug, publicSlug);
  const visibleDocs = orderedDocs.filter((doc) => !hiddenIds.has(doc.id ?? ""));

  const toggleDocHidden = (docId: string) => {
    setHiddenIds((current) => {
      const next = new Set(current);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleReorder = (fromIndex: number, toIndex: number, edge: Edge | null) => {
    setOrderedDocs((current) => {
      if (fromIndex === toIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      let insertAt = toIndex + (edge === "bottom" ? 1 : 0);
      if (fromIndex < insertAt) insertAt -= 1;
      next.splice(insertAt, 0, moved);
      return next;
    });
  };

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const handleSave = async () => {
    if (isSaving) return;
    const projectId = folder.project_ids?.[0];
    if (!folder.id || !projectId) return;

    const normalizedSlug = normalizePublicPageSlug(slug);
    if (normalizedSlug) {
      const slugError = validatePublicPageSlug(normalizedSlug);
      if (slugError) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Invalid link URL", message: slugError });
        return;
      }
    }

    setIsSaving(true);
    try {
      // This modal owns every wiki key, so the object is rebuilt (not merged)
      // — switching theme back to Auto must drop the stored key.
      const wikiNext: Record<string, unknown> = {
        order: orderedDocs.map((doc) => doc.id).filter(Boolean),
        hidden: [...hiddenIds],
        accent,
      };
      if (theme !== "auto") wikiNext.theme = theme;
      const nextViewProps: Record<string, unknown> = {
        ...folder.view_props,
        public_slug: normalizedSlug,
        wiki: wikiNext,
      };
      const trimmedName = wikiName.trim();
      const renamePayload = trimmedName && trimmedName !== getPageName(folder.name) ? { name: trimmedName } : {};
      await pageService.update(workspaceSlug, projectId, folder.id, {
        view_props: nextViewProps,
        ...renamePayload,
      } as Partial<TPage>);

      const nextAccess = isPublished ? EPageAccess.PUBLIC : EPageAccess.PRIVATE;
      if (nextAccess !== folder.access) {
        await pageService.updateAccess(workspaceSlug, projectId, folder.id, { access: nextAccess });
      }

      await onSaved();
      if (isCreateFlow && isPublished) {
        // Show the artifact, don't vanish: swap to the success view with the
        // live link instead of closing into a transient toast.
        setIsSaving(false);
        setPhase("published");
        return;
      }
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Wiki settings saved",
        message: isPublished ? buildPublicPagePath(workspaceSlug, publicSlug) : undefined,
      });
      onClose();
    } catch (error) {
      const message =
        error && typeof error === "object" && "error" in error && typeof (error as { error: unknown }).error === "string"
          ? ((error as { error: string }).error ?? "")
          : "Settings could not be saved. Please try again.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
      setIsSaving(false);
    }
  };

  const copyLink = () => {
    void copyUrlToClipboard(publicUrl).then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: "Wiki link copied" }));
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <style>{WIKI_MODAL_CSS}</style>
      {phase === "published" ? (
        <div className="wiki-phase-in relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 grid size-7 place-items-center rounded-lg text-tertiary hover:bg-layer-1 hover:text-primary"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
          <div
            className="flex justify-center rounded-t-lg px-8 pt-10 pb-0"
            style={{
              background: `linear-gradient(180deg, ${WIKI_ACCENTS[accent].light}2e 0%, ${WIKI_ACCENTS[accent].light}08 100%)`,
            }}
          >
            <div className="w-60 rounded-t-xl border border-b-0 border-subtle bg-surface-1 px-5 pt-5 pb-3 shadow-raised-100">
              <p
                className="truncate text-16 text-primary"
                style={{ fontFamily: '"Sorts Mill Goudy", Georgia, serif' }}
              >
                {wikiName.trim() || getPageName(folder.name)}
              </p>
              <div className="mt-3 flex flex-col gap-1.5 border-t border-subtle pt-3">
                {visibleDocs.slice(0, 3).map((doc) => (
                  <p key={doc.id} className="flex items-center gap-1.5 truncate text-11 text-secondary">
                    <FileText className="size-3 shrink-0 text-tertiary" />
                    {getPageName(doc.name)}
                  </p>
                ))}
                {visibleDocs.length === 0 && <p className="text-11 text-tertiary">No visible docs</p>}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-4 px-8 py-6 text-center">
            <div>
              <h2 className="text-20 font-semibold text-primary">Your wiki is live!</h2>
              <p className="mt-1.5 text-13 text-secondary">
                {visibleDocs.length} {visibleDocs.length === 1 ? "doc is" : "docs are"} readable by anyone with the
                link. Share it to give people read access.
              </p>
            </div>
            <div className="flex h-11 w-full items-center overflow-hidden rounded-lg border border-subtle">
              <span className="grid size-11 shrink-0 place-items-center text-tertiary">
                <Link className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate pr-3 text-left text-13 text-primary">
                {buildPublicPagePath(workspaceSlug, publicSlug)}
              </span>
              <button
                type="button"
                onClick={copyLink}
                className="flex h-full shrink-0 items-center gap-1.5 border-l border-subtle px-4 text-13 font-medium text-primary hover:bg-layer-1"
              >
                <Copy className="size-3.5" />
                Copy link
              </button>
            </div>
            <a
              href={buildPublicPagePath(workspaceSlug, publicSlug)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(getButtonStyling("primary", "lg"), "w-full justify-center")}
            >
              View wiki
            </a>
            <p className="text-11 text-tertiary">
              Manage doc order, theme, or unpublish anytime from the Share button on this folder.
            </p>
          </div>
        </div>
      ) : (
        <div className="wiki-phase-in flex max-h-[82vh] flex-col">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-subtle px-5 py-4">
            <h2 className="truncate text-16 font-medium text-primary">
              {isCreateFlow ? "Create wiki" : "Wiki settings"}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-tertiary hover:bg-layer-1 hover:text-primary disabled:opacity-60"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-13 font-medium text-primary">Publish wiki</p>
                <p className="text-12 text-tertiary">Anyone with the link can read the visible docs in this wiki.</p>
              </div>
              <ToggleSwitch value={isPublished} onChange={() => setIsPublished((value) => !value)} disabled={isSaving} />
            </div>
            {!isCreateFlow && !isPublished && (
              <p className="-mt-3 text-11 text-tertiary">
                This wiki is live. Saving with publish off takes the link offline.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-11 font-medium text-secondary">Wiki name</span>
                <input
                  value={wikiName}
                  onChange={(event) => setWikiName(event.target.value)}
                  disabled={isSaving}
                  placeholder={getPageName(folder.name)}
                  className="focus:border-accent-primary h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder disabled:opacity-60"
                />
              </label>
              <div>
                <span className="mb-1.5 block text-11 font-medium text-secondary">Theme</span>
                <div ref={themeGroupRef} className="relative flex h-10 w-fit items-center gap-0.5 rounded-lg border border-subtle p-0.5">
                  {themePill && (
                    <span
                      aria-hidden
                      className="shadow-sm absolute top-0.5 bottom-0.5 left-0 rounded-md bg-layer-1 transition-[width,transform] duration-200 ease-in-out"
                      style={{ width: themePill.width, transform: `translateX(${themePill.left}px)` }}
                    />
                  )}
                  {THEME_CHOICES.map((choice) => (
                    <button
                      key={choice.key}
                      type="button"
                      data-active={theme === choice.key}
                      onClick={() => setTheme(choice.key)}
                      disabled={isSaving}
                      aria-label={choice.label}
                      title={choice.label}
                      className={cn(
                        "t-colors relative z-[1] grid h-full w-10 place-items-center rounded-md text-tertiary hover:text-primary",
                        theme === choice.key && "text-primary"
                      )}
                    >
                      <choice.icon className="size-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-11 font-medium text-secondary">Link URL</span>
              <div className="flex items-center gap-2">
                <div className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-subtle bg-surface-1 px-3">
                  <span className="shrink-0 text-13 text-placeholder">/published/{workspaceSlug}/</span>
                  <input
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    disabled={isSaving}
                    placeholder={folder.id ?? "custom-url"}
                    className="h-full w-full min-w-0 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder disabled:opacity-60"
                  />
                </div>
                <button
                  type="button"
                  onClick={copyLink}
                  className="grid size-10 shrink-0 place-items-center rounded-lg border border-subtle text-tertiary hover:bg-layer-1 hover:text-primary"
                  aria-label="Copy public link"
                  title="Copy public link"
                >
                  <Copy className="size-4" />
                </button>
                <a
                  href={buildPublicPagePath(workspaceSlug, publicSlug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid size-10 shrink-0 place-items-center rounded-lg border border-subtle text-tertiary hover:bg-layer-1 hover:text-primary"
                  aria-label="Open public link"
                  title="Open public link"
                >
                  <Link className="size-4" />
                </a>
              </div>
              {!isPublished && (
                <p className="mt-1.5 text-11 text-tertiary">
                  Until the wiki is published, this link opens as a preview only workspace members can see.
                </p>
              )}
            </div>

            <div>
              <span className="mb-1.5 block text-11 font-medium text-secondary">Accent color</span>
              <div className="flex items-center gap-2">
                {(Object.keys(WIKI_ACCENTS) as TWikiAccentKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAccent(key)}
                    disabled={isSaving}
                    aria-label={WIKI_ACCENTS[key].label}
                    title={WIKI_ACCENTS[key].label}
                    className={cn(
                      "grid size-8 place-items-center rounded-full border border-subtle transition-shadow duration-200 ease-in-out",
                      accent === key && "ring-accent-primary ring-2 ring-offset-2 ring-offset-surface-1"
                    )}
                  >
                    <span className="size-5 rounded-full" style={{ background: WIKI_ACCENTS[key].light }} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-11 font-medium text-secondary">Docs</span>
              <p className="-mt-0.5 mb-1.5 text-11 text-tertiary">Drag to reorder. Hidden docs stay off the wiki.</p>
              {orderedDocs.length === 0 ? (
                <p className="rounded-lg border border-subtle px-3 py-2.5 text-12 text-tertiary">
                  No docs in this wiki yet.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-subtle">
                  {orderedDocs.map((doc, index) => (
                    <WikiDocRow
                      key={doc.id}
                      doc={doc}
                      index={index}
                      isLast={index === orderedDocs.length - 1}
                      isHidden={hiddenIds.has(doc.id ?? "")}
                      disabled={isSaving}
                      onToggleHidden={() => doc.id && toggleDocHidden(doc.id)}
                      onReorder={handleReorder}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-subtle px-5 py-3">
            <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="primary" size="lg" loading={isSaving} onClick={() => void handleSave()}>
              {isCreateFlow ? "Create wiki" : "Save settings"}
            </Button>
          </div>
        </div>
      )}
    </ModalCore>
  );
}

type WikiDocRowProps = {
  doc: TPage;
  index: number;
  isLast: boolean;
  isHidden: boolean;
  disabled: boolean;
  onToggleHidden: () => void;
  onReorder: (fromIndex: number, toIndex: number, edge: Edge | null) => void;
};

function WikiDocRow({ doc, index, isLast, isHidden, disabled, onToggleHidden, onReorder }: WikiDocRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = rowRef.current;
    if (!element || disabled) return;
    return combine(
      draggable({
        element,
        getInitialData: () => ({ docId: doc.id, index }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data.docId !== doc.id,
        getData: ({ input, element: targetElement }) =>
          attachClosestEdge({ docId: doc.id, index }, { input, element: targetElement, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop: ({ self, source }) => {
          setClosestEdge(null);
          onReorder(source.data.index as number, index, extractClosestEdge(self.data));
        },
      })
    );
  }, [disabled, doc.id, index, onReorder]);

  return (
    <div className="border-b border-subtle last:border-b-0">
      <DropIndicator isVisible={closestEdge === "top"} />
      <div
        ref={rowRef}
        className={cn("flex cursor-grab items-center gap-2.5 px-3 py-2 transition-opacity duration-200 ease-in-out", {
          "cursor-grabbing opacity-50": isDragging,
          "opacity-60": isHidden && !isDragging,
        })}
      >
        <GripHandle />
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-layer-1 text-tertiary">
          <FileText className="size-4" />
        </span>
        <p className={cn("min-w-0 flex-1 truncate text-13 text-primary", { "line-through": isHidden })}>
          {getPageName(doc.name)}
        </p>
        {isHidden && (
          <span className="shrink-0 rounded-lg border border-subtle px-1.5 py-0.5 text-10 text-tertiary">Hidden</span>
        )}
        <button
          type="button"
          onClick={onToggleHidden}
          disabled={disabled}
          className="grid size-7 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-1 hover:text-primary disabled:opacity-40"
          aria-label={isHidden ? `Show ${getPageName(doc.name)} on the wiki` : `Hide ${getPageName(doc.name)} from the wiki`}
          title={isHidden ? "Show on wiki" : "Hide from wiki"}
        >
          {isHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {isLast && <DropIndicator isVisible={closestEdge === "bottom"} />}
    </div>
  );
}

// Mirrors the stickies / editor block drag handle: two vertical-ellipsis
// glyphs side by side form the 6-dot grip.
const VerticalEllipsis = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

function GripHandle() {
  return (
    <span className="flex shrink-0 items-center text-placeholder">
      <VerticalEllipsis />
      <VerticalEllipsis className="-ml-2.5" />
    </span>
  );
}

const WIKI_MODAL_CSS = `
@keyframes wiki-phase-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.wiki-phase-in { animation: wiki-phase-in 200ms ease-in-out both; }
@media (prefers-reduced-motion: reduce) {
  .wiki-phase-in { animation-duration: 1ms; }
}
`;
