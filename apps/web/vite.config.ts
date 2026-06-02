import path from "node:path";
import * as dotenv from "dotenv";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import type { ProxyOptions } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  if (mode !== "production") {
    dotenv.config({ path: path.resolve(__dirname, ".env") });
  }

  const devApiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:8000";
  const devApiProxyOrigin = new URL(devApiProxyTarget).origin;
  const devProxyRedirectRewrites = [
    ["https://app.dragonfruit.sh", process.env.VITE_WEB_BASE_URL],
    ["https://admin.dragonfruit.sh", process.env.VITE_ADMIN_BASE_URL],
    ["https://spaces.dragonfruit.sh", process.env.VITE_SPACE_BASE_URL],
  ].filter((rewrite): rewrite is [string, string] => typeof rewrite[1] === "string" && rewrite[1].trim() !== "");
  const configureDevApiProxy: NonNullable<ProxyOptions["configure"]> = (proxy) => {
    proxy.on("proxyReq", (proxyReq) => proxyReq.setHeader("origin", devApiProxyOrigin));
    proxy.on("proxyRes", (proxyRes) => {
      const locationHeader = proxyRes.headers.location;
      if (typeof locationHeader === "string") {
        const rewrite = devProxyRedirectRewrites.find(([from]) => locationHeader.startsWith(from));
        if (rewrite) proxyRes.headers.location = locationHeader.replace(rewrite[0], rewrite[1]);
      }

      const setCookieHeader = proxyRes.headers["set-cookie"];
      if (!setCookieHeader) return;

      proxyRes.headers["set-cookie"] = setCookieHeader.map((cookie) =>
        cookie.replace(/;\s*Secure/gi, "").replace(/;\s*SameSite=None/gi, "; SameSite=Lax")
      );
    });
  };

  // Expose only vars starting with VITE_
  const viteEnv = Object.keys(process.env)
    .filter((k) => k.startsWith("VITE_"))
    .reduce<Record<string, string>>((a, k) => {
      a[k] = process.env[k] ?? "";
      return a;
    }, {});

  return {
    envDir: mode === "production" ? false : undefined,
    publicDir: path.resolve(__dirname, "public"),
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
      // Dev-only: dedupe prosemirror-* so TipTap extension bundles share one
      // prosemirror-view instance — otherwise the dev server's optimized deps
      // carry duplicates and decorations crash with "Cannot read properties of
      // undefined (reading 'localsInner')". NOT applied in the production build:
      // there the bundler already resolves a single copy, and forcing dedupe
      // (especially @tiptap/pm, which uses subpath exports) breaks Rollup
      // resolution under isolated linking.
      dedupe: [
        "react",
        "react-dom",
        "@headlessui/react",
        ...(mode === "production"
          ? []
          : ["prosemirror-view", "prosemirror-state", "prosemirror-model", "prosemirror-transform"]),
      ],
    },
    server: {
      host: "127.0.0.1",
      // Proxy backend routes so the browser sees same-origin requests and CORS
      // isn't required in dev. Cookie domains are stripped so hosted API auth can
      // still work through localhost.
      proxy: {
        "/api": {
          target: devApiProxyTarget,
          changeOrigin: true,
          cookieDomainRewrite: "",
          configure: configureDevApiProxy,
        },
        "/auth": {
          target: devApiProxyTarget,
          changeOrigin: true,
          cookieDomainRewrite: "",
          configure: configureDevApiProxy,
        },
        "/spaces": {
          target: devApiProxyTarget,
          changeOrigin: true,
          cookieDomainRewrite: "",
          configure: configureDevApiProxy,
        },
      },
    },
    // No SSR-specific overrides needed; alias resolves to ESM build
  };
});
