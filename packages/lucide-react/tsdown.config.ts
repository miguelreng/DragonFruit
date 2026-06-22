import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  platform: "neutral",
  exports: true,
  external: ["react", "react-dom", "@plane/icons", "@solar-icons/react"],
});
