import React from "react";
import type { TextInputProps, TextProps, TextStyle } from "react-native";

type ReactNativeModule = typeof import("react-native") & {
  Text: React.ComponentType<TextProps>;
  TextInput: React.ComponentType<TextInputProps> & { State?: unknown };
};

declare const require: (moduleName: "react-native") => ReactNativeModule;

const ReactNative = require("react-native");
const OriginalText = ReactNative.Text;
const OriginalTextInput = ReactNative.TextInput;
const { StyleSheet } = ReactNative;
const OriginalTextElement = OriginalText as React.ElementType;
const OriginalTextInputElement = OriginalTextInput as React.ElementType;

export const figtreeFonts = {
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
  italic: "Figtree_400Italic",
  mediumItalic: "Figtree_500MediumItalic",
  semiboldItalic: "Figtree_600SemiBoldItalic",
  boldItalic: "Figtree_700BoldItalic",
} as const;

let installed = false;

function numericWeight(weight: TextStyle["fontWeight"]): number {
  if (weight === "bold") return 700;
  if (typeof weight === "number") return weight;

  const parsed = Number.parseInt(String(weight ?? "400"), 10);
  return Number.isFinite(parsed) ? parsed : 400;
}

function familyFor(style: TextProps["style"] | TextInputProps["style"]): string {
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  const italic = String(flat.fontStyle ?? "").toLowerCase() === "italic";
  const weight = numericWeight(flat.fontWeight);

  if (weight >= 700) return italic ? figtreeFonts.boldItalic : figtreeFonts.bold;
  if (weight >= 600) return italic ? figtreeFonts.semiboldItalic : figtreeFonts.semibold;
  if (weight >= 500) return italic ? figtreeFonts.mediumItalic : figtreeFonts.medium;
  return italic ? figtreeFonts.italic : figtreeFonts.regular;
}

function withFigtree(style: TextProps["style"] | TextInputProps["style"]): TextProps["style"] {
  // Respect an explicit fontFamily (e.g. Newsreader for the home greeting).
  // Overriding it here is what kept those serif styles from ever applying —
  // and stripping fontStyle would break Newsreader's italic resolution on iOS.
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  if (flat.fontFamily) return style as TextProps["style"];

  return [
    style,
    {
      fontFamily: familyFor(style),
      fontStyle: undefined,
      fontWeight: undefined,
    },
  ] as TextProps["style"];
}

const TextWithFigtree = React.forwardRef<unknown, TextProps>((props, ref) =>
  React.createElement(OriginalTextElement, {
    ...props,
    ref,
    style: withFigtree(props.style),
  }),
);
TextWithFigtree.displayName = "Text";

const TextInputWithFigtree = React.forwardRef<unknown, TextInputProps>((props, ref) =>
  React.createElement(OriginalTextInputElement, {
    ...props,
    ref,
    style: withFigtree(props.style) as TextInputProps["style"],
  }),
) as React.ComponentType<TextInputProps> & { State?: unknown };
TextInputWithFigtree.displayName = "TextInput";
TextInputWithFigtree.State = OriginalTextInput.State;

export function installDefaultFont(): void {
  if (installed) return;
  installed = true;

  Object.defineProperty(ReactNative, "Text", {
    configurable: true,
    enumerable: true,
    get: () => TextWithFigtree,
  });

  Object.defineProperty(ReactNative, "TextInput", {
    configurable: true,
    enumerable: true,
    get: () => TextInputWithFigtree,
  });
}
