/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Preview } from "@storybook/react-vite";
// eslint-disable-next-line import/no-unassigned-import -- Storybook loads Tailwind as a global stylesheet.
import "./tailwind.css";
// eslint-disable-next-line import/no-unassigned-import -- Storybook loads docs token styles as a global stylesheet.
import "./preview.css";

import { dragonfruitDocsTheme } from "./dragonfruit-theme";

type DragonfruitThemeMode = "light" | "dark" | "system";

function getResolvedTheme(mode: unknown): "light" | "dark" {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";

  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

const parameters: Preview["parameters"] = {
  backgrounds: {
    default: "Canvas",
    options: {
      Canvas: { name: "Canvas", value: "#f3f3f4" },
      Surface: { name: "Surface", value: "#ffffff" },
      Subtle: { name: "Subtle", value: "#fafafa" },
    },
  },
  controls: {
    matchers: {},
  },
  docs: {
    theme: dragonfruitDocsTheme,
  },
};

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const themeMode = (context.globals.theme || "system") as DragonfruitThemeMode;
      const resolvedTheme = getResolvedTheme(themeMode);

      if (typeof document !== "undefined") {
        document.documentElement.dataset.theme = resolvedTheme;
        document.body.dataset.theme = resolvedTheme;
      }

      return Story();
    },
  ],
  globalTypes: {
    theme: {
      description: "DragonFruit theme tokens",
      defaultValue: "system",
      toolbar: {
        icon: "circlehollow",
        items: [
          { title: "System", value: "system" },
          { title: "Light", value: "light" },
          { title: "Dark", value: "dark" },
        ],
        title: "Theme",
      },
    },
  },
  parameters,
  tags: ["autodocs"],
};
export default preview;
