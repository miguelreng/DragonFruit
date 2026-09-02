/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { StorybookConfig } from "@storybook/react-vite";

import { join, dirname } from "path";

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Plug'n'Play (PnP) or are set up within a monorepo.
 */
function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, "package.json")));
}

/**
 * The single component catalog for DragonFruit.
 *
 * It lives in @plane/ui rather than @plane/propel because ui already depends on
 * propel, so this is the only package that can render BOTH layers live. Adding
 * the reverse dependency would make the workspace build graph cyclic.
 */
const config: StorybookConfig = {
  // Both layers in one catalog. propel's stories are read from source (not dist)
  // so the gallery shows the primitives as they are written.
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../../propel/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: [getAbsolutePath("@storybook/addon-docs")],
  framework: {
    name: getAbsolutePath("@storybook/react-vite"),
    options: {},
  },
  staticDirs: [{ from: "../../../branding", to: "/branding" }],
  /**
   * @plane/constants reads `process.env` at module scope. The app bundlers define
   * it; Storybook's browser build does not, so shim it or every story that pulls
   * in a ui component dies on `process is not defined`.
   */
  viteFinal(config) {
    config.define = { ...config.define, "process.env": {}, "process.platform": '"browser"' };
    // Several deps (cmdk, radix, framer-motion, base-ui) ship a top-level
    // "use client" directive. Rollup can't keep it when bundling and the warning
    // is escalated to an error during the static build — it is harmless here,
    // since Storybook is a client-only bundle.
    config.build = {
      ...config.build,
      rollupOptions: {
        ...config.build?.rollupOptions,
        onwarn(warning, defaultHandler) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          defaultHandler(warning);
        },
      },
    };
    return config;
  },
};
export default config;
