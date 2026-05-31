/**
 * Brand palette + design tokens for StyleSheet-based screens.
 *
 * NativeWind/react-native-css-interop doesn't support React Native 0.85 yet, so
 * we style with React Native's built-in StyleSheet (zero-runtime, always works).
 * Mirrors the values in tailwind.config.js for visual continuity.
 */
export const colors = {
  accent: "#e445a6",
  canvas: "#f7f7fb",
  ink: "#1f2230",
  muted: "#5d6274",
  white: "#ffffff",
  danger: "#dc2626",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const fontSize = {
  sm: 14,
  base: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
} as const;
