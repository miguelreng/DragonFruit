import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

const presets = process.env.VERCEL ? [vercelPreset()] : [];

export default {
  appDirectory: "app",
  // Public pages can be reached directly under /spaces/* or through the
  // canonical dragonfruit.page/:workspace/:type/* gateway. A root basename
  // lets the same client router hydrate both visible URL shapes; Vite's base
  // path still controls where static assets are served.
  basename: "/",
  presets,
  ssr: true,
} satisfies Config;
