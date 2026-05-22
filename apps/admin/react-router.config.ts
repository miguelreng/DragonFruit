import type { Config } from "@react-router/dev/config";
import { joinUrlPath } from "@plane/utils";
import * as dotenv from "dotenv";

const isBuildCommand = process.argv.includes("build");

if (process.env.NODE_ENV !== "production" && !isBuildCommand) {
  dotenv.config({ path: ".env" });
}

const basePath = joinUrlPath(process.env.VITE_ADMIN_BASE_PATH ?? "", "/") ?? "/";

export default {
  appDirectory: "app",
  basename: basePath,
  // Admin runs as a client-side app; build a static client bundle only
  ssr: false,
} satisfies Config;
