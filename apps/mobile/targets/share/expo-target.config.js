/** @type {import("@bacons/apple-targets").Config} */
// Share Extension target, generated into the Xcode project on prebuild. Lets a
// link shared from Safari (or any app) be saved as a bookmark — see index.swift.
// The App Group MUST match `ios.entitlements` in app.config.js and the suite
// name read by index.swift / written by lib/share-bookmark.ts.
module.exports = {
  type: "share",
  displayName: "DragonFruit",
  deploymentTarget: "17.0",
  icon: "../../assets/images/icon.png",
  entitlements: {
    "com.apple.security.application-groups": ["group.sh.dragonfruit.mobile"],
  },
};
