// Plain Expo preset. NativeWind was removed: its Metro/css-interop hook crashes
// Metro 0.84 (RN 0.85) on file changes, and the app styles with React Native
// StyleSheet (not className), so nothing here needs it.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
