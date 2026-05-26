import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL || "https://dragonfruit.sh",
  integrations: [sitemap()],
});
