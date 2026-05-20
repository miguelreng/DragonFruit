/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Curated highlight.js language bundle for the doc editor.
 *
 * lowlight's `common` import registers ~37 languages and adds ~500 KB to
 * the editor chunk. The vast majority of code blocks in a PM tool are
 * JS/TS/Python/SQL/Shell/Markdown/JSON/YAML. We register exactly that set
 * (with a few extras for full-stack teams) and skip the long tail.
 *
 * Add a new language by importing it and pushing it into REGISTRY below.
 * Anything not registered falls back to plaintext rendering — no errors.
 */

import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

/**
 * (alias, language) pairs registered into the shared lowlight instance.
 * Aliases are intentionally minimal — lowlight already handles common ones
 * like "js" / "ts" / "py" through the underlying highlight.js language
 * definitions themselves.
 */
const REGISTRY = [
  ["bash", bash],
  ["css", css],
  ["diff", diff],
  ["go", go],
  ["html", xml],
  ["java", java],
  ["javascript", javascript],
  ["js", javascript],
  ["json", json],
  ["markdown", markdown],
  ["md", markdown],
  ["python", python],
  ["py", python],
  ["rust", rust],
  ["shell", shell],
  ["sh", shell],
  ["sql", sql],
  ["ts", typescript],
  ["tsx", typescript],
  ["typescript", typescript],
  ["xml", xml],
  ["yaml", yaml],
  ["yml", yaml],
] as const;

const shared = createLowlight();
for (const [alias, lang] of REGISTRY) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shared.register(alias, lang as any);
}

export const lowlight = shared;
