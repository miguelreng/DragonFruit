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
    // Dev-only: pre-bundle the heavy dependencies that are reached only on
    // specific routes (drag-and-drop boards, the rich-text editor, charts, PDF
    // export, the command palette, etc.). Many sit behind code-split / React.lazy
    // boundaries or come transitively through linked @plane/* packages, so Vite's
    // cold-start crawl doesn't see them. Without this, the FIRST navigation into
    // such a route makes Vite discover the deps, run a fresh optimize pass, and
    // emit "optimized dependencies changed. reloading" — which invalidates the
    // chunks the current page already loaded (504 Outdated Optimize Dep), aborts
    // the in-flight route module import, and strands the page on a loading
    // skeleton until a manual reload. Listing them up front folds all that work
    // into one cold-start optimize so navigation never triggers a reload.
    //
    // This list mirrors the deps Vite logged as "newly optimized" mid-session,
    // so every entry is known to resolve. If a new heavy dep ever causes the same
    // stall, add its entry point here. No effect on the production build, where
    // Rollup bundles everything ahead of time.
    optimizeDeps: {
      include: [
        // Drag-and-drop — stickies, kanban / issue boards
        "@atlaskit/pragmatic-drag-and-drop/combine",
        "@atlaskit/pragmatic-drag-and-drop/element/adapter",
        "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview",
        "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview",
        "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge",
        "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item",
        "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element",
        // Rich-text editor (TipTap / ProseMirror) — pages, docs, descriptions, comments
        "@tiptap/core",
        "@tiptap/react",
        "@tiptap/html",
        "@tiptap/starter-kit",
        "@tiptap/suggestion",
        "@tiptap/pm/model",
        "@tiptap/pm/state",
        "@tiptap/pm/view",
        "@tiptap/pm/tables",
        "@tiptap/pm/transform",
        "@tiptap/extension-collaboration",
        "@tiptap/extension-task-item",
        "@tiptap/extension-task-list",
        "@tiptap/extension-text-style",
        "@tiptap/extension-underline",
        "@tiptap/extension-character-count",
        "@tiptap/extension-placeholder",
        "@tiptap/extension-image",
        "@tiptap/extension-mention",
        "@tiptap/extension-emoji",
        "@tiptap/extension-blockquote",
        "@tiptap/extension-text-align",
        "@tiptap/extension-document",
        "@tiptap/extension-heading",
        "@tiptap/extension-text",
        "tiptap-markdown",
        "prosemirror-codemark",
        // Collaborative editing (Yjs)
        "yjs",
        "y-prosemirror",
        "y-indexeddb",
        "@hocuspocus/provider",
        // Syntax highlighting (editor code blocks)
        "lowlight",
        "highlight.js/lib/core",
        "highlight.js/lib/languages/bash",
        "highlight.js/lib/languages/css",
        "highlight.js/lib/languages/diff",
        "highlight.js/lib/languages/go",
        "highlight.js/lib/languages/java",
        "highlight.js/lib/languages/javascript",
        "highlight.js/lib/languages/json",
        "highlight.js/lib/languages/markdown",
        "highlight.js/lib/languages/python",
        "highlight.js/lib/languages/rust",
        "highlight.js/lib/languages/shell",
        "highlight.js/lib/languages/sql",
        "highlight.js/lib/languages/typescript",
        "highlight.js/lib/languages/xml",
        "highlight.js/lib/languages/yaml",
        // Editor UI helpers
        "tippy.js",
        "@floating-ui/dom",
        "@floating-ui/react",
        "linkifyjs",
        "jsx-dom-cjs",
        "emoji-regex",
        "is-emoji-supported",
        "frimousse",
        "smooth-scroll-into-view-if-needed",
        "use-font-face-observer",
        "buffer",
        // Charts & PDF export
        "recharts",
        "@react-pdf/renderer",
        // Shared UI / forms
        "cmdk",
        "react-hook-form",
        "framer-motion",
        "react-day-picker",
        "@base-ui-components/react",
        "@base-ui-components/react/context-menu",
        "@base-ui-components/react/menu",
        "@base-ui-components/react/popover",
        "@base-ui-components/react/scroll-area",
        // Top-loading navigation progress bar
        "@bprogress/core",
      ],
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
