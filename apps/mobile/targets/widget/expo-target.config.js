/** @type {import("@bacons/apple-targets").Config} */
// WidgetKit extension target, generated into the Xcode project on prebuild.
// The App Group MUST match `ios.entitlements` in app.json and the suite name
// used by `lib/calendar-widget.ts`.
module.exports = {
  type: "widget",
  displayName: "Calendar",
  deploymentTarget: "17.0",
  icon: "../../assets/images/icon.png",
  colors: {
    $accent: "#e445a6",
    $widgetBackground: "#ffffff",
  },
  entitlements: {
    "com.apple.security.application-groups": ["group.sh.dragonfruit.mobile"],
  },
};
