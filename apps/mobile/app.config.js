// Dynamic config layered on top of app.json.
//
// The iOS calendar widget needs an App Group, and App Groups require a *paid*
// Apple Developer account. To keep free / Personal-Team device builds signable,
// the widget (its target + the App Group entitlement) is OFF by default and
// only added when EXPO_PUBLIC_WIDGET_ENABLED=1.
//
//   • Free build (default):     pnpm --filter mobile exec expo prebuild -p ios --clean
//   • With widget (paid):       EXPO_PUBLIC_WIDGET_ENABLED=1 pnpm --filter mobile exec expo prebuild -p ios --clean
//
// The same flag gates the runtime widget sync in lib/calendar-widget.ts.

const APP_GROUP = "group.sh.dragonfruit.mobile";
const WIDGET_ENABLED = process.env.EXPO_PUBLIC_WIDGET_ENABLED === "1";

module.exports = ({ config }) => {
  if (!WIDGET_ENABLED) return config;

  return {
    ...config,
    ios: {
      ...config.ios,
      entitlements: {
        ...config.ios?.entitlements,
        "com.apple.security.application-groups": [APP_GROUP],
      },
    },
    plugins: [...(config.plugins ?? []), "@bacons/apple-targets"],
  };
};
