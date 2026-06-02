import "@expo/metro-runtime";
import "react-native-gesture-handler";

import type React from "react";

import { installDefaultFont } from "./lib/fonts";

declare const require: (moduleName: string) => unknown;

installDefaultFont();

const { App } = require("expo-router/build/qualified-entry") as { App: React.ComponentType };
const { renderRootComponent } = require("expo-router/build/renderRootComponent") as {
  renderRootComponent: (component: React.ComponentType) => void;
};

renderRootComponent(App);
