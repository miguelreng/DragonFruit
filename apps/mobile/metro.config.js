// Learn more: https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so changes in shared packages hot-reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then the hoisted workspace root.
//    (pnpm symlinks the app's deps into apps/mobile/node_modules.)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./src/global.css" });
