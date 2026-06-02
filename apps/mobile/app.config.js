// Dynamic config layered on top of app.json.
//
// Two iOS app extensions live in targets/: the calendar widget and the "Save to
// DragonFruit" share extension. Both need the App Group, and App Groups require
// a *paid* Apple Developer account. To keep free / Personal-Team device builds
// signable, the targets (and the App Group entitlement) are OFF by default and
// only added when their flag is set:
//
//   • Free build (default):     pnpm --filter mobile exec expo prebuild -p ios --clean
//   • Widget (paid):            EXPO_PUBLIC_WIDGET_ENABLED=1 pnpm --filter mobile exec expo prebuild -p ios --clean
//   • Share extension (paid):   EXPO_PUBLIC_SHARE_ENABLED=1  pnpm --filter mobile exec expo prebuild -p ios --clean
//
// The @bacons/apple-targets plugin globs every targets/* config, so enabling
// either flag builds both targets — fine, since both gate on the same paid
// account. The same flags gate the runtime sync in lib/calendar-widget.ts and
// lib/share-bookmark.ts.

const APP_GROUP = "group.sh.dragonfruit.mobile";
const WIDGET_ENABLED = process.env.EXPO_PUBLIC_WIDGET_ENABLED === "1";
const SHARE_ENABLED = process.env.EXPO_PUBLIC_SHARE_ENABLED === "1";
const NATIVE_TARGETS_ENABLED = WIDGET_ENABLED || SHARE_ENABLED;

module.exports = ({ config }) => {
  if (!NATIVE_TARGETS_ENABLED) return config;

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
