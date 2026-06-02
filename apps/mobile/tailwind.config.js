/** @type {import('tailwindcss').Config} */
// NativeWind v4 runs on Tailwind v3 (the web app's Tailwind v4 config is separate).
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // DragonFruit semantic tokens from the web app theme.
        accent: "#aa0276",
        "accent-primary": "#aa0276",
        "accent-primary-hover": "#940266",
        "accent-primary-active": "#7f0258",
        "accent-subtle": "#fff7f8",
        "accent-subtle-hover": "#fffafb",
        "accent-subtle-active": "#ffeef5",
        "accent-bright": "#ff2cb5",
        "accent-soft": "#ffe3f1",
        canvas: "#f4f5f5",
        surface: "#ffffff",
        "surface-muted": "#fafafa",
        sidebar: "#fafafa",
        "layer-1": "#f4f5f5",
        "layer-1-hover": "#eeeff0",
        "layer-1-active": "#e6e8e9",
        ink: "#1d1f20",
        body: "#4e5355",
        muted: "#676c6f",
        faint: "#80868a",
        border: "#eaebeb",
        "border-strong": "#dadcdd",
        success: "#16a34a",
        warning: "#d97706",
        danger: "#dc2626",
        "danger-soft": "#fef2f2",
      },
      fontFamily: {
        sans: ["Figtree_400Regular"],
      },
    },
  },
  plugins: [],
};
