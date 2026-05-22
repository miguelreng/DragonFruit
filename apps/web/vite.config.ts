import path from "node:path";
import * as dotenv from "dotenv";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  if (mode !== "production") {
    dotenv.config({ path: path.resolve(__dirname, ".env") });
  }

  // Expose only vars starting with VITE_
  const viteEnv = Object.keys(process.env)
    .filter((k) => k.startsWith("VITE_"))
    .reduce<Record<string, string>>((a, k) => {
      a[k] = process.env[k] ?? "";
      return a;
    }, {});

  return {
    envDir: mode === "production" ? false : undefined,
    define: {
      "process.env": JSON.stringify(viteEnv),
    },
    build: {
      assetsInlineLimit: 0,
    },
    plugins: [reactRouter(), tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] })],
    resolve: {
      alias: {
        // Next.js compatibility shims used within web
        "next/link": path.resolve(__dirname, "app/compat/next/link.tsx"),
        "next/navigation": path.resolve(__dirname, "app/compat/next/navigation.ts"),
        "next/script": path.resolve(__dirname, "app/compat/next/script.tsx"),
      },
      dedupe: ["react", "react-dom", "@headlessui/react"],
    },
    server: {
      host: "127.0.0.1",
      // Proxy backend routes to the Django API container so the browser sees same-origin
      // requests and CORS isn't required in dev. Matches the routes in apps/api/plane/urls.py.
      proxy: {
        "/api": { target: "http://localhost:8000", changeOrigin: true },
        "/auth": { target: "http://localhost:8000", changeOrigin: true },
        "/spaces": { target: "http://localhost:8000", changeOrigin: true },
      },
    },
    // No SSR-specific overrides needed; alias resolves to ESM build
  };
});
