import path from "node:path";
import * as dotenv from "dotenv";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  if (mode !== "production") {
    dotenv.config({ path: path.resolve(__dirname, ".env") });
  }

  const devApiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET || "https://api.dragonfruit.sh";

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
      // Proxy backend routes so the browser sees same-origin requests and CORS
      // isn't required in dev. Cookie domains are stripped so hosted API auth can
      // still work through localhost.
      proxy: {
        "/api": { target: devApiProxyTarget, changeOrigin: true, cookieDomainRewrite: "" },
        "/auth": { target: devApiProxyTarget, changeOrigin: true, cookieDomainRewrite: "" },
        "/spaces": { target: devApiProxyTarget, changeOrigin: true, cookieDomainRewrite: "" },
      },
    },
    // No SSR-specific overrides needed; alias resolves to ESM build
  };
});
