// Learn more: https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require("expo/metro-config");
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

// NativeWind 4 / react-native-css-interop's Metro integration crashes Metro 0.84
// (Expo SDK 56 / RN 0.85) on file-change events — "Cannot read properties of
// undefined (reading 'addedFiles')" — which kept killing the dev server on save.
// The app styles with React Native StyleSheet (src/lib/theme.ts), not className,
// so NativeWind is unused here and removed from the build.
module.exports = config;
