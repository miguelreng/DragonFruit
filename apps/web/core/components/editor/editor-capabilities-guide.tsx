/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { HelpCircle, Maximize2, Minimize2 } from "@plane/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";

/**
 * KEEP THIS CURRENT: whenever a new editor capability ships (slash command,
 * mention type, Atlas action, selection tool…), add it here — this guide is
 * the in-product feed of what the editor can do.
 */
const EDITOR_CAPABILITIES: { group: string; items: { keys: string; label: string }[] }[] = [
  {
    group: "Write & format",
    items: [
      { keys: "/", label: "Open the command menu — headings, lists, tables, images, callouts, quotes, code" },
      { keys: "Select text", label: "Bubble menu: bold, italic, color, alignment, links" },
      { keys: "Icon · Cover", label: "Give the doc an icon and a cover image" },
      { keys: "Options ⋯", label: "Focus mode (fade all but the block you're writing), full width, font, drop cap" },
    ],
  },
  {
    group: "Wikipedia",
    items: [
      { keys: "@topic", label: "Mention a Wikipedia article — linked chip with hover summary" },
      { keys: "/wiki topic", label: "Insert a cited summary block" },
      { keys: "/cite claim", label: "Type a claim or select one first — attaches the best Wikipedia source" },
      { keys: "/link-terms", label: "Auto-link notable terms in the doc to Wikipedia" },
      { keys: "/check-citations", label: "Verify every Wikipedia citation still resolves" },
      { keys: "Select → 🌐", label: "Explain the selected phrase with a Wikipedia card" },
    ],
  },
  {
    group: "Atlas",
    items: [
      { keys: "Ask Atlas", label: "Bottom bar — Quick ask, Rewrite, Plan, or Summarize what you're writing" },
      { keys: "/agent", label: "Open the Ask-Atlas bar with the current block as context" },
      { keys: "Select → Reply", label: "Pin a passage to the Ask-Atlas bar and reply to it" },
      {
        keys: "✓ · ✕ proposals",
        label:
          "Atlas edits arrive as proposals — accept or reject each in the margin, tick several, or Accept all / Reject all from the bar",
      },
      { keys: "brief me on X", label: "Atlas researches the topic on Wikipedia and creates a sourced doc" },
      { keys: "✓ in chat", label: "Fact-check mode — every claim gets a Wikipedia citation" },
    ],
  },
  {
    group: "Collaborate",
    items: [
      { keys: "@name", label: "Mention teammates, agents, or tasks" },
      { keys: "Select → 💬", label: "Comment on a passage" },
      { keys: "Publish", label: "Share a public read-only version of the doc" },
    ],
  },
];

/**
 * Open the guide from anywhere in the doc UI (e.g. the page options menu)
 * without threading state down to the header control.
 */
const OPEN_GUIDE_EVENT = "dragonfruit:open-editor-guide";

export function openEditorCapabilitiesGuide() {
  window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT));
}

/**
 * The one entry point for the guide: a "?" control in the page header (next to
 * the lock control) that drops the panel down over the editor area. The
 * page-options "How to use this editor" item opens the same panel via
 * OPEN_GUIDE_EVENT. The panel can expand into a wider two-column view for
 * comfortable reading.
 */
export function EditorCapabilitiesGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener(OPEN_GUIDE_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Reopen compact: the expanded view is a per-read affordance, not a mode.
      setIsExpanded(false);
      return;
    }
    const handleDismiss = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setIsOpen(false);
        return;
      }
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleDismiss);
    document.addEventListener("keydown", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleDismiss);
      document.removeEventListener("keydown", handleDismiss);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <Tooltip tooltipContent="What this editor can do" position="bottom">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-label="What this editor can do"
          className={cn(
            "grid size-6 flex-shrink-0 place-items-center rounded-lg text-secondary transition-colors hover:bg-layer-1 hover:text-primary",
            isOpen && "bg-layer-1 text-primary"
          )}
        >
          <HelpCircle className="size-3.5" />
        </button>
      </Tooltip>
      <div
        data-state={isOpen ? "open" : "closed"}
        data-origin="top-right"
        aria-hidden={!isOpen}
        className={cn(
          "t-dropdown absolute top-full right-0 z-30 mt-2 rounded-xl border border-strong bg-surface-1 shadow-raised-200 transition-[width] duration-200 ease-out",
          isExpanded ? "w-[40rem] max-w-[calc(100vw-3rem)]" : "w-[340px]"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <div className="text-13 font-semibold text-primary">What this editor can do</div>
          <Tooltip tooltipContent={isExpanded ? "Collapse" : "Expand"} position="bottom">
            <button
              type="button"
              onClick={() => setIsExpanded((expanded) => !expanded)}
              aria-label={isExpanded ? "Collapse the guide" : "Expand the guide"}
              tabIndex={isOpen ? 0 : -1}
              className="grid size-6 shrink-0 place-items-center rounded-lg text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
            >
              {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </Tooltip>
        </div>
        <div
          className={cn(
            "vertical-scrollbar scrollbar-sm overflow-y-auto p-4 pt-3",
            isExpanded ? "max-h-[75vh]" : "max-h-[60vh]"
          )}
        >
          <div className={cn(isExpanded ? "grid grid-cols-2 gap-x-8 gap-y-5" : "space-y-4")}>
            {EDITOR_CAPABILITIES.map((section) => (
              <div key={section.group}>
                <div className="mb-1.5 text-10 font-medium tracking-wide text-tertiary uppercase">{section.group}</div>
                <div className="space-y-1.5">
                  {section.items.map((item) => (
                    <div key={item.keys + item.label} className="flex items-start gap-2">
                      <span className="font-mono mt-px shrink-0 rounded bg-layer-1 px-1.5 py-0.5 text-10 text-secondary">
                        {item.keys}
                      </span>
                      <span className="text-12 leading-5 text-secondary">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
