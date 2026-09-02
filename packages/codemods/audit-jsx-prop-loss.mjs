/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Guard against silent JSX attribute loss.
 *
 * TypeScript cannot catch this class of bug: on our primitives every prop but
 * `icon` is optional, so rewriting
 *
 *   <button onClick={fn} className={cn(base, { active })}>…</button>
 *   →  <IconButton icon={X} />
 *
 * type-checks cleanly while the button is now dead. Migrating 81 icon-buttons
 * produced three such regressions (a dead "Comment" action in the editor bubble
 * menu, two toggles that lost their active state) — all green under tsc.
 *
 * This compares the parsed JSX of each changed file against a git ref and
 * reports behaviour-carrying attributes that were present before and are gone
 * after. It keys on name + value text, so a handler that merely *moved* to a
 * different element is not a finding — only one that vanished.
 *
 *   node scripts/audit-jsx-prop-loss.mjs                 # working tree vs HEAD
 *   node scripts/audit-jsx-prop-loss.mjs --ref main
 *   node scripts/audit-jsx-prop-loss.mjs --warn-only     # never exit non-zero
 *   node scripts/audit-jsx-prop-loss.mjs --verbose       # also show rewritten handlers
 *   node scripts/audit-jsx-prop-loss.mjs apps/web/…/x.tsx
 *
 * Expect false positives when a file also carries unrelated uncommitted work:
 * this reports what disappeared, it cannot know whether you meant it. Recover
 * original values from `git show <ref>:<file>`, never from memory.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import ts from "typescript";

const args = process.argv.slice(2);
const warnOnly = args.includes("--warn-only");
const verbose = args.includes("--verbose");
const refIndex = args.indexOf("--ref");
const ref = refIndex === -1 ? "HEAD" : args[refIndex + 1];
const paths = args.filter(
  (a, i) => !a.startsWith("--") && i !== refIndex + 1 && /\.(tsx|jsx)$/.test(a)
);

const git = (cmdArgs, quiet = false) =>
  execFileSync("git", cmdArgs, {
    encoding: "utf8",
    maxBuffer: 1 << 28,
    stdio: ["ignore", "pipe", quiet ? "ignore" : "inherit"],
  });

/**
 * Attributes worth tracking by exact value. Anything that carries behaviour or
 * identity — dropping one changes what the element *does*, not how it looks.
 * `className`/`style` are deliberately excluded here (they legitimately churn);
 * conditional classNames get their own check below.
 */
const isTracked = (name) =>
  /^on[A-Z]/.test(name) ||
  name.startsWith("aria-") ||
  [
    "ref", "key", "type", "role", "disabled", "checked", "defaultChecked", "value",
    "defaultValue", "name", "id", "href", "htmlFor", "tabIndex", "title", "placeholder",
    "readOnly", "required", "autoFocus", "form", "target", "rel", "download", "loading",
  ].includes(name);

const squash = (s) => s.replace(/\s+/g, " ").trim();

/** Collect the attribute fingerprint of one source file. */
function fingerprint(fileName, source) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const attrs = new Map(); // "name\0value" -> count
  const names = new Map(); // name -> count
  let conditionalClassNames = 0; // className={cn(…)} / template literals

  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

  const visit = (node) => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      const valueText = node.initializer ? squash(node.initializer.getText(sf)) : "true";
      if (isTracked(name)) {
        bump(attrs, `${name}\0${valueText}`);
        bump(names, name);
      }
      // Any *className prop, not just `className`: a conditional moved onto
      // IconButton lands in `iconClassName`, and CustomSelect uses
      // `customButtonClassName`. Counting only `className` would call a
      // correctly-migrated conditional a loss.
      if (/[cC]lassName$/.test(name) && /\bcn\(|\$\{/.test(valueText)) conditionalClassNames += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return { attrs, names, conditionalClassNames };
}

function changedFiles() {
  if (paths.length > 0) return paths;
  const out = git(["diff", "--name-only", ref, "--", "*.tsx", "*.jsx"]).trim();
  return out ? out.split("\n") : [];
}

function oldSource(file) {
  try {
    return git(["show", `${ref}:${file}`], true);
  } catch {
    return null; // added file — nothing to lose
  }
}

const files = changedFiles();
if (files.length === 0) {
  console.log(`No changed .tsx/.jsx files against ${ref}.`);
  process.exit(0);
}

let findings = 0;
let filesWithFindings = 0;

for (const file of files) {
  if (!fs.existsSync(file)) continue; // deleted
  const before = oldSource(file);
  if (before === null) continue;
  const after = fs.readFileSync(file, "utf8");
  if (before === after) continue;

  let a, b;
  try {
    a = fingerprint(file, before);
    b = fingerprint(file, after);
  } catch (err) {
    console.error(`  ! could not parse ${file}: ${err.message}`);
    continue;
  }

  // Tier 1 — the attribute disappeared from the file entirely. If `onClick`
  // went 5 → 4, one element genuinely lost its handler. This is the signal.
  // Tier 2 — the count held but a value changed: the handler was rewritten,
  // not dropped. Usually deliberate, so it is --verbose only.
  const lost = [];
  const rewritten = [];
  for (const [name, before] of a.names) {
    const after = b.names.get(name) ?? 0;
    const vanished = [];
    for (const [key, count] of a.attrs) {
      if (!key.startsWith(`${name}\0`)) continue;
      const missing = count - (b.attrs.get(key) ?? 0);
      // Every primitive defaults to type="button", so losing it in a migration
      // is expected. Losing type="submit" is not — that silently breaks a form.
      if (missing > 0 && !(name === "type" && key.endsWith('\0"button"'))) {
        vanished.push({ value: key.split("\0")[1], missing });
      }
    }
    if (vanished.length === 0) continue;
    (after < before ? lost : rewritten).push({ name, dropped: before - after, vanished });
  }
  const flattened = a.conditionalClassNames - b.conditionalClassNames;

  if (lost.length === 0 && flattened <= 0 && !(verbose && rewritten.length > 0)) continue;

  filesWithFindings += 1;
  console.log(`\n${file}`);
  const show = (v) => (v.length > 110 ? `${v.slice(0, 107)}…` : v);
  for (const { name, dropped, vanished } of lost) {
    findings += dropped;
    console.log(`  ✗ ${name} — ${dropped} fewer than in ${ref}`);
    for (const { value } of vanished) console.log(`      gone: ${name}=${show(value)}`);
  }
  if (flattened > 0) {
    findings += flattened;
    console.log(
      `  ✗ ${flattened} conditional className${flattened > 1 ? "s" : ""} flattened — check for a lost active/selected state`
    );
  }
  if (verbose) {
    for (const { name, vanished } of rewritten) {
      for (const { value } of vanished) console.log(`  · ${name} rewritten, was: ${show(value)}`);
    }
  }
}

console.log("");
if (findings === 0) {
  console.log(`No JSX attributes lost across ${files.length} changed file(s) vs ${ref}.`);
  process.exit(0);
}

console.log(
  `${findings} attribute(s) present in ${ref} and absent now, across ${filesWithFindings} file(s).\n` +
    `Each one is either intentional or a silently dead handler. Confirm with:\n` +
    `  git diff -U15 ${ref} -- <file>`
);
process.exit(warnOnly ? 0 : 1);
