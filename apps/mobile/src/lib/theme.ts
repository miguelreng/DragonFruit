/**
 * DragonFruit mobile design system — exact tokens from the web app
 * (packages/tailwind-config/variables.css, OKLCH converted to sRGB hex).
 *
 * NativeWind/react-native-css-interop doesn't support RN 0.85 yet, so screens
 * style with React Native's StyleSheet using these tokens. Typography uses
 * Figtree (the web's sans font), loaded in the root layout.
 */
export const colors = {
  // Surface tokens (mirrors web semantic tokens in light mode)
  canvas: "#f4f5f5", // bg-canvas
  surface: "#ffffff", // bg-surface-1
  surfaceMuted: "#fafafa", // bg-surface-2
  sidebar: "#fafafa",
  raised: "#f4f5f5",
  layer1: "#f4f5f5", // bg-layer-1
  layer1Hover: "#eeeff0", // bg-layer-1-hover
  layer1Active: "#e6e8e9", // bg-layer-1-active
  layerTransparentHover: "rgba(0, 0, 0, 0.05)", // bg-layer-transparent-hover
  layerTransparentActive: "rgba(0, 0, 0, 0.1)", // bg-layer-transparent-active

  // Text tokens
  textPrimary: "#1d1f20", // txt-primary
  textSecondary: "#4e5355", // txt-secondary
  textTertiary: "#676c6f", // txt-tertiary
  textPlaceholder: "#80868a", // txt-placeholder
  ink: "#1d1f20",
  body: "#4e5355",
  muted: "#676c6f",
  faint: "#80868a",

  // Accent/brand tokens — primary accent is #e548a5; hover/active are derived
  // darker shades (~87% / ~75% lightness of the base).
  accentPrimary: "#e548a5", // bg-accent-primary
  accentPrimaryHover: "#c73f90", // bg-accent-primary-hover
  accentPrimaryActive: "#ac367c", // bg-accent-primary-active
  accentSubtle: "#fff7f8", // danger-subtle token is used by web sidebar active
  accentSubtleHover: "#fffafb",
  accentSubtleActive: "#ffeef5",
  brand: "#e548a5",
  brandBright: "#ff2cb5",
  brandSoft: "#ffe3f1",
  brandText: "#e548a5",

  // Border tokens
  border: "#eaebeb", // border-subtle
  borderStrong: "#dadcdd", // border-strong
  borderDisabled: "#f4f5f5",
  pressed: "rgba(0, 0, 0, 0.04)",
  overlay: "rgba(0, 0, 0, 0.4)",

  // Semantic
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  white: "#ffffff",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  pill: 999,
} as const;

export const font = {
  /** Loaded in src/app/_layout.tsx from the app's bundled Figtree font files. */
  family: "Figtree_400Regular",
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 30,
  },
  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
} as const;

/** Soft elevation shadow for cards / floating elements. */
export const shadow = {
  card: {
    shadowColor: "#1d1f20",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  button: {
    shadowColor: "#1d1f20",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

/** Deterministic accent for workspace/user avatars, keyed off a string. */
const AVATAR_COLORS = ["#aa0276", "#4f46e5", "#0d9488", "#16a34a", "#ea580c", "#be123c", "#7c3aed"] as const;
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
