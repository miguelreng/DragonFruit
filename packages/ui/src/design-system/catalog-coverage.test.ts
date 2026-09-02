/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Guards the design-system catalog against rot.
 *
 * A component that ships without a story is a component the next person will
 * reinvent, because the catalog is the only place they look. This test is the
 * mechanism that keeps "the Storybook is up to date" true rather than aspirational.
 *
 * If this fails: add a `<component>.stories.tsx` next to the component, or — if the
 * thing genuinely has nothing to show — add it to EXEMPT with a reason.
 */

const here = dirname(fileURLToPath(import.meta.url));
const UI_SRC = join(here, "..");
const PROPEL_SRC = join(here, "..", "..", "..", "propel", "src");

/** Directories that are not user-facing components. */
const NOT_COMPONENTS = new Set([
  "constants",
  "design-system",
  "hooks",
  "styles",
  "utils",
  "icons",
  "charts",
  "portal",
]);

/** Components with a deliberate reason to have no story of their own. */
const EXEMPT: Record<string, string> = {
  // Layout primitives are documented together in Design System/Layout.
  "content-wrapper": "documented in Design System/Layout",
  header: "documented in Design System/Layout",
  row: "documented in Design System/Layout",
  // Documented as part of another component's story.
  "emoji-icon-picker": "shown inside emoji-reaction stories",
  "emoji-reaction": "has its own stories under a different filename",
  // Behavioural helpers with no visual surface.
  "control-link": "renders an <a> or a <button>, nothing to look at",
  "drag-handle.tsx": "affordance shown inside sortable stories",
  "drop-indicator.tsx": "affordance shown inside sortable stories",
  "scroll-area.tsx": "thin wrapper over the propel primitive",
  "loader.tsx": "documented in Design System/Component Catalog",
  "favorite-star.tsx": "documented in Design System/Component Catalog",
  "auth-form": "app-specific composition, not a reusable primitive",
  oauth: "app-specific composition, not a reusable primitive",
  typography: "documented by the token stories",
  "toggle-switch": "documented in Design System/Forms",
  // Documented together in Design System/Forms.
  "form-fields": "documented in Design System/Forms",
  dropdown: "documented in Design System/Forms (CustomSelect / CustomSearchSelect)",
  dropdowns: "documented in Design System/Forms (CustomSelect / CustomSearchSelect)",
  modals: "documented in Design System/Component Catalog",
};

/** Every entry directly under a package's src/ that represents a component. */
function componentDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith(".") && name !== "index.ts")
    .filter((name) => !NOT_COMPONENTS.has(name))
    .filter((name) => !name.endsWith(".test.ts") && !name.endsWith(".test.tsx"));
}

/** True when `entry` (a dir or a single file) has an adjacent story. */
function hasStory(root: string, entry: string): boolean {
  const full = join(root, entry);
  if (statSync(full).isDirectory()) {
    return readdirSync(full).some((f) => f.endsWith(".stories.tsx"));
  }
  // A single-file component: look for `<name>.stories.tsx` beside it.
  const base = entry.replace(/\.tsx?$/, "");
  return existsSync(join(root, `${base}.stories.tsx`));
}

/**
 * Components that predate the catalog and still lack a story. This list is a
 * RATCHET: it may shrink, never grow. Deleting an entry (by writing the story)
 * is the intended way to make progress; adding one is a regression the review
 * should reject.
 */
const KNOWN_GAPS_UI = new Set<string>([
  // Empty: every @dragonfruit/ui component now has a story. Keep it that way — an entry
  // here is a debt, not a parking space.
]);

describe("design-system catalog coverage", () => {
  it("documents every @dragonfruit/propel component", () => {
    const missing = componentDirs(PROPEL_SRC).filter((e) => !EXEMPT[e] && !hasStory(PROPEL_SRC, e));
    expect(missing, `propel components without a story: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not add new undocumented @dragonfruit/ui components", () => {
    const missing = componentDirs(UI_SRC).filter((e) => !EXEMPT[e] && !hasStory(UI_SRC, e));
    const brandNew = missing.filter((e) => !KNOWN_GAPS_UI.has(e));
    expect(
      brandNew,
      `New components must ship with a <name>.stories.tsx so the catalog stays the ` +
        `single reference: ${brandNew.join(", ")}`
    ).toEqual([]);
  });

  it("shrinks the documentation backlog, never grows it", () => {
    const missing = new Set(componentDirs(UI_SRC).filter((e) => !EXEMPT[e] && !hasStory(UI_SRC, e)));
    const closed = [...KNOWN_GAPS_UI].filter((e) => !missing.has(e));
    expect(
      closed,
      `These now have stories — remove them from KNOWN_GAPS_UI to lock the progress in: ${closed.join(", ")}`
    ).toEqual([]);
  });

  it("keeps exactly one implementation per consolidated slot", () => {
    // These were duplicated across both packages and have been consolidated.
    // A directory reappearing on the losing side means the fork is back.
    const mustNotExist: [string, string][] = [
      [join(UI_SRC, "button"), "Button lives in @dragonfruit/propel/button"],
      [join(UI_SRC, "card"), "Card lives in @dragonfruit/propel/card"],
      [join(UI_SRC, "tooltip"), "Tooltip lives in @dragonfruit/propel/tooltip"],
      [join(UI_SRC, "spinners"), "Spinner lives in @dragonfruit/propel/spinners"],
      [join(PROPEL_SRC, "avatar"), "Avatar lives in @dragonfruit/ui"],
      [join(PROPEL_SRC, "menu"), "the dropdown is CustomMenu in @dragonfruit/ui"],
      [join(PROPEL_SRC, "skeleton"), "the skeleton is Loader in @dragonfruit/ui"],
      [join(UI_SRC, "badge"), "Badge lives in @dragonfruit/propel/badge"],
      [join(UI_SRC, "tabs"), "Tabs lives in @dragonfruit/propel/tabs"],
      [join(PROPEL_SRC, "collapsible"), "Collapsible lives in @dragonfruit/ui"],
    ];
    const resurrected = mustNotExist.filter(([p]) => existsSync(p)).map(([p, why]) => `${p} — ${why}`);
    expect(resurrected, `duplicate implementations reappeared:\n${resurrected.join("\n")}`).toEqual([]);
  });
});
