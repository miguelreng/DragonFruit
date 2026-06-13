/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState, type ReactNode } from "react";
import Script from "next/script";
import { Links, Meta, Outlet, Scripts, useLocation } from "react-router";
import type { LinksFunction } from "react-router";
import { ThemeProvider } from "next-themes";
// plane imports
import { SITE_DESCRIPTION, SITE_NAME } from "@plane/constants";
import { cn } from "@plane/utils";
// types
// assets
import favicon16 from "@/app/assets/favicon/favicon-16x16.png?url";
import favicon32 from "@/app/assets/favicon/favicon-32x32.png?url";
import icon180 from "@/app/assets/icons/icon-180x180.png?url";
import icon512 from "@/app/assets/icons/icon-512x512.png?url";
import ogAppImage from "@/app/assets/og-app.png?url";
import globalStyles from "@/styles/globals.css?url";
import type { Route } from "./+types/root";
// local
import { CustomErrorComponent } from "./error";
import { AppProvider } from "./provider";
import { AppLoadingScreen } from "@/components/common/app-loading-screen";
// fonts – side-effect imports
// Figtree is self-hosted from /public/fonts via @font-face in globals.css.
// Material Symbols: only the Latin subset at weight 400 ships — the icon
// picker uses `font-weight: normal` and no non-Latin glyphs, so the other
// 3 weights (100/200/300) + their .woff fallbacks were ~600 KB of dead
// font data.
// oxlint-disable-next-line no-unassigned-import
import "@fontsource/material-symbols-rounded/latin-400.css";
// oxlint-disable-next-line no-unassigned-import
import "@fontsource/ibm-plex-mono";

const APP_TITLE = "DragonFruit — Beautiful project management & docs";

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: favicon32 },
  { rel: "icon", type: "image/png", sizes: "16x16", href: favicon16 },
  { rel: "shortcut icon", href: "/favicon.ico" },
  { rel: "apple-touch-icon", href: icon512 },
  { rel: "apple-touch-icon", sizes: "180x180", href: icon180 },
  { rel: "apple-touch-icon", sizes: "512x512", href: icon512 },
  { rel: "manifest", href: "/manifest.json" },
  { rel: "stylesheet", href: globalStyles },
  {
    rel: "preload",
    href: "/fonts/Figtree-Variable.ttf",
    as: "font",
    type: "font/ttf",
    crossOrigin: "anonymous",
  },
  {
    rel: "preload",
    href: "/fonts/Newsreader-Variable.ttf",
    as: "font",
    type: "font/ttf",
    crossOrigin: "anonymous",
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const isSessionRecorderEnabled = parseInt(process.env.VITE_ENABLE_SESSION_RECORDER || "0");

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#fff" />
        {/* Meta info for PWA */}
        <meta name="application-name" content="DragonFruit" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={SITE_NAME} />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <Meta />
        <Links />
      </head>
      <body suppressHydrationWarning>
        <div id="context-menu-portal" />
        <div id="editor-portal" />
        <ThemeProvider themes={["light", "dark", "sepia"]} defaultTheme="light">
          {children}
        </ThemeProvider>
        <Scripts />
        {!!isSessionRecorderEnabled && process.env.VITE_SESSION_RECORDER_KEY && (
          <Script id="clarity-tracking">
            {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];if(y){y.parentNode.insertBefore(t,y);}
          })(window, document, "clarity", "script", "${process.env.VITE_SESSION_RECORDER_KEY}");`}
          </Script>
        )}
      </body>
    </html>
  );
}

export const meta: Route.MetaFunction = () => [
  { title: APP_TITLE },
  { name: "description", content: SITE_DESCRIPTION },
  { property: "og:title", content: APP_TITLE },
  {
    property: "og:description",
    content: "Open-source project management tool to manage tasks, cycles, and product roadmaps easily",
  },
  { property: "og:url", content: "https://app.dragonfruit.sh/" },
  { property: "og:image", content: ogAppImage },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:image:alt", content: "DragonFruit - Modern project management" },
  {
    name: "keywords",
    content:
      "software development, plan, ship, software, accelerate, code management, release management, project management, task tracking, agile, scrum, kanban, collaboration",
  },
  { name: "twitter:site", content: "@planepowers" },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:image", content: ogAppImage },
  { name: "twitter:image:width", content: "1200" },
  { name: "twitter:image:height", content: "630" },
  { name: "twitter:image:alt", content: "DragonFruit - Modern project management" },
];

export default function Root() {
  const { pathname } = useLocation();
  const [hasMounted, setHasMounted] = useState(false);
  const isPublicRoute =
    pathname === "/google-oauth" || pathname.startsWith("/legal/") || pathname.startsWith("/published/");

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (isPublicRoute) {
    return (
      <div className={cn("relative flex h-screen w-full flex-col overflow-hidden bg-canvas", "desktop-app-container")}>
        <main className="relative h-full w-full overflow-y-auto">
          <Outlet />
        </main>
      </div>
    );
  }

  if (!hasMounted) return <AppLoadingScreen />;

  return (
    <AppProvider>
      <div className={cn("relative flex h-screen w-full flex-col overflow-hidden bg-canvas", "desktop-app-container")}>
        <main className="relative h-full w-full overflow-hidden">
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

export function HydrateFallback() {
  return <AppLoadingScreen />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <CustomErrorComponent error={error} />;
}
