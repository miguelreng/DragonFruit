module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource: "nativewind" lets className flow through to RN views.
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
