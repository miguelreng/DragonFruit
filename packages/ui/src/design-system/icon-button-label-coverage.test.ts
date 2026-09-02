/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, it, expect } from "vitest";

/**
 * Every `IconButton` must carry an accessible name.
 *
 * `IconButton` takes no children — its whole content is a glyph — so without an
 * `aria-label` a screen reader announces "button" and nothing else. Wrapping it
 * in a `<Tooltip>` does not help: that is a visual affordance, not an accessible
 * name. This is invisible to `tsc` (every prop but `icon` is optional) and to
 * oxlint (its jsx-a11y plugin does not implement `control-has-associated-label`,
 * and would not know `IconButton` is a control even if it did), so it needs its
 * own ratchet — the same mechanism that keeps the catalog honest.
 *
 * The icon-button migration left 29 of these behind. Keep the count at zero.
 *
 * If this fails: add `aria-label` (or `title`) saying what the button *does*,
 * not what the icon is — "Copy link", not "Copy icon".
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..", "..", "..");

const ROOTS = [
  "apps/web/core",
  "apps/web/ce",
  "apps/web/app",
  "apps/space/components",
  "apps/admin",
  "packages/ui/src",
  "packages/propel/src",
  "packages/editor/src",
];

const NAMING_PROPS = new Set(["aria-label", "aria-labelledby", "title"]);

function tsxFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/^(node_modules|dist|build)$/.test(entry.name)) found.push(...tsxFilesIn(full));
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".stories.tsx")) {
      found.push(full);
    }
  }
  return found;
}

/** `<IconButton>` usages in one file that carry no accessible name. */
function unnamedIn(file: string): string[] {
  const source = readFileSync(file, "utf8");
  if (!source.includes("IconButton")) return [];

  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText(sourceFile) === "IconButton") {
        const props = node.attributes.properties;
        // A spread could carry the label; we cannot see through it, so trust it.
        const spread = props.some((p) => ts.isJsxSpreadAttribute(p));
        const named = props.some(
          (p) => ts.isJsxAttribute(p) && NAMING_PROPS.has(p.name.getText(sourceFile))
        );
        if (!spread && !named) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1;
          hits.push(`${relative(REPO, file)}:${line}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

describe("IconButton accessible names", () => {
  it("every IconButton has an aria-label, aria-labelledby or title", () => {
    const unnamed = ROOTS.flatMap((root) => tsxFilesIn(join(REPO, root))).flatMap(unnamedIn);
    expect(unnamed, `IconButton without an accessible name:\n  ${unnamed.join("\n  ")}`).toEqual([]);
  });
});
