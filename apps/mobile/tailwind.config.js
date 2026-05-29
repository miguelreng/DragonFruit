/** @type {import('tailwindcss').Config} */
// NativeWind v4 runs on Tailwind v3 (the web app's Tailwind v4 config is separate).
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // A small slice of the Dragon Fruit palette for visual continuity.
        // Expand toward @plane/tailwind-config tokens as the UI grows.
        accent: "#e445a6",
        canvas: "#f7f7fb",
        ink: "#1f2230",
        muted: "#5d6274",
      },
    },
  },
  plugins: [],
};
