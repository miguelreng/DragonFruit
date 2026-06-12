/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "@plane/icons";
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
      { keys: "/", label: "Open the command menu — headings, lists, tables, images, quotes, code" },
      { keys: "Select text", label: "Bubble menu: bold, italic, color, alignment, links" },
      { keys: "Icon · Cover", label: "Give the doc an icon and a cover image" },
      { keys: "Drag ⋮⋮", label: "Reorder blocks — to-do items get a grab handle on hover, even in stickies" },
    ],
  },
  {
    group: "Wikipedia",
    items: [
      { keys: "@topic", label: "Mention a Wikipedia article — linked chip with hover summary" },
      { keys: "/wiki topic", label: "Insert a cited summary block" },
      { keys: "/cite", label: "Select a claim first — attaches the best Wikipedia source" },
      { keys: "/link-terms", label: "Auto-link notable terms in the doc to Wikipedia" },
      { keys: "/check-citations", label: "Verify every Wikipedia citation still resolves" },
      { keys: "Select → Explain", label: "Explain the selected phrase with a Wikipedia card" },
    ],
  },
  {
    group: "Atlas",
    items: [
      { keys: "Ask Atlas", label: "Bottom bar — ask about or edit what you're writing" },
      { keys: "/agent", label: "Send the current block to Atlas as a prompt" },
      { keys: "Select → Reply", label: "Reply to a passage with Atlas in the drawer" },
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

export function EditorCapabilitiesGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleDismiss = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setIsOpen(false);
        return;
      }
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleDismiss);
    document.addEventListener("keydown", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleDismiss);
      document.removeEventListener("keydown", handleDismiss);
    };
  }, [isOpen]);

  return (
    <div ref={panelRef} className="fixed bottom-6 left-6 z-40">
      {isOpen && (
        <div className="vertical-scrollbar mb-2 scrollbar-sm max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-strong bg-surface-1 p-4 shadow-raised-200">
          <div className="mb-3 text-13 font-semibold text-primary">What this editor can do</div>
          <div className="space-y-4">
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
      )}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Editor capabilities guide"
        title="What can this editor do?"
        className={cn(
          "grid size-9 place-items-center rounded-full border border-strong bg-surface-1 text-tertiary shadow-raised-100 transition-colors hover:text-primary",
          isOpen && "text-primary"
        )}
      >
        <HelpCircle className="size-4" />
      </button>
    </div>
  );
}
