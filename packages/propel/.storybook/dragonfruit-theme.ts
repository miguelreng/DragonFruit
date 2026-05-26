/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { create } from "storybook/theming";

const fontBase = 'Figtree, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const fontCode = '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace';

export const dragonfruitBrand = {
  title: "DragonFruit Design System",
  url: "https://app.dragonfruit.sh",
  image: "/branding/logo-white.svg",
  target: "_self",
};

export const dragonfruitManagerTheme = create({
  base: "dark",
  brandTitle: dragonfruitBrand.title,
  brandUrl: dragonfruitBrand.url,
  brandImage: dragonfruitBrand.image,
  brandTarget: dragonfruitBrand.target,
  colorPrimary: "#aa0276",
  colorSecondary: "#ff6bc3",
  appBg: "#090b0c",
  appContentBg: "#0e1011",
  appPreviewBg: "#fafafa",
  appBorderColor: "#27292b",
  appBorderRadius: 6,
  barBg: "#0e1011",
  barTextColor: "#d5d6d7",
  barHoverColor: "#3a1029",
  barSelectedColor: "#ff6bc3",
  textColor: "#eeeeef",
  textInverseColor: "#090b0c",
  textMutedColor: "#a8aaab",
  fontBase,
  fontCode,
  buttonBg: "#270b1b",
  buttonBorder: "#56173d",
  booleanBg: "#27292b",
  booleanSelectedBg: "#ff6bc3",
  inputBg: "#090b0c",
  inputBorder: "#27292b",
  inputBorderRadius: 6,
  inputTextColor: "#eeeeef",
});

export const dragonfruitDocsTheme = create({
  base: "light",
  brandTitle: dragonfruitBrand.title,
  brandUrl: dragonfruitBrand.url,
  brandImage: "/branding/logo.svg",
  brandTarget: dragonfruitBrand.target,
  colorPrimary: "#aa0276",
  colorSecondary: "#ff2cb5",
  appBg: "#fafafa",
  appContentBg: "#ffffff",
  appPreviewBg: "#ffffff",
  appBorderColor: "#dadcdd",
  appBorderRadius: 6,
  barBg: "#ffffff",
  barTextColor: "#4e5355",
  barHoverColor: "#fff1f8",
  barSelectedColor: "#aa0276",
  textColor: "#090b0c",
  textInverseColor: "#ffffff",
  textMutedColor: "#676c6f",
  fontBase,
  fontCode,
  buttonBg: "#fff8fb",
  buttonBorder: "#ffe3f1",
  booleanBg: "#eaebeb",
  booleanSelectedBg: "#aa0276",
  inputBg: "#ffffff",
  inputBorder: "#dadcdd",
  inputBorderRadius: 6,
  inputTextColor: "#090b0c",
});
