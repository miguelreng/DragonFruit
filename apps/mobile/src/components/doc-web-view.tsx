import { ActivityIndicator, Image, Linking, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { colors } from "@/lib/theme";

const figtreeRegularUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-Regular.ttf")).uri;
const figtreeMediumUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-Medium.ttf")).uri;
const figtreeSemiBoldUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-SemiBold.ttf")).uri;
const figtreeBoldUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-Bold.ttf")).uri;
const figtreeItalicUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-Italic.ttf")).uri;
const newsreaderRegularUri = Image.resolveAssetSource(require("../../assets/fonts/Newsreader-Regular.ttf")).uri;
const newsreaderSemiBoldUri = Image.resolveAssetSource(require("../../assets/fonts/Newsreader-SemiBold.ttf")).uri;
const newsreaderItalicUri = Image.resolveAssetSource(require("../../assets/fonts/Newsreader-Italic.ttf")).uri;

// Font stacks mirroring the web editor's variables.css. Mobile bundles the
// same Figtree and Newsreader families used by the app.
const FIGTREE = `"Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
const NEWSREADER = `"Newsreader", "Iowan Old Style", "Apple Garamond", "Palatino", Georgia, serif`;

/** The four doc font choices a page can carry in `view_props.font_style`. */
export type DocFontStyle = "font-default" | "font-figtree" | "font-newsreader";

// body = --font-style, display = h1–h3 + blockquote (--font-style-display),
// displaySans = h4–h6 (--font-style-display-sans). See packages/editor variables.css.
const FONT_STYLE_FAMILIES: Record<DocFontStyle, { body: string; display: string; displaySans: string }> = {
  // The mobile reader follows the web app's sans reading surface by default.
  // Serif remains available when a page explicitly opts into font-newsreader.
  "font-default": { body: FIGTREE, display: FIGTREE, displaySans: FIGTREE },
  "font-figtree": { body: FIGTREE, display: FIGTREE, displaySans: FIGTREE },
  "font-newsreader": { body: NEWSREADER, display: NEWSREADER, displaySans: NEWSREADER },
};

const LEGACY_FONT_STYLE: Record<string, DocFontStyle> = {
  "sans-serif": "font-default",
  serif: "font-newsreader",
  monospace: "font-figtree",
};

/** Resolve the stored `view_props.font_style` to a known style, defaulting to "font-default". */
function normalizeDocFontStyle(value: string | null | undefined): DocFontStyle {
  if (value && value in FONT_STYLE_FAMILIES) return value as DocFontStyle;
  if (value && value in LEGACY_FONT_STYLE) return LEGACY_FONT_STYLE[value];
  return "font-default";
}

/**
 * Read-only renderer for a page's `description_html`. We hand the exact HTML the
 * web editor produces to a WebView with a clean typographic reset — far higher
 * fidelity (tables, code blocks, images, callouts) than re-implementing a
 * React Native HTML parser, and it scrolls as a natural reader.
 *
 * Typography honors the reader's per-page font choice (`view_props.font_style`)
 * set on web, splitting body vs. heading/display families the same way.
 */
function buildDocument(html: string, fontStyle: DocFontStyle): string {
  const { body, display, displaySans } = FONT_STYLE_FAMILIES[fontStyle];
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />
  <style>
    @font-face { font-family: "Figtree"; src: url("${figtreeRegularUri}") format("truetype"); font-weight: 400; font-style: normal; }
    @font-face { font-family: "Figtree"; src: url("${figtreeMediumUri}") format("truetype"); font-weight: 500; font-style: normal; }
    @font-face { font-family: "Figtree"; src: url("${figtreeSemiBoldUri}") format("truetype"); font-weight: 600; font-style: normal; }
    @font-face { font-family: "Figtree"; src: url("${figtreeBoldUri}") format("truetype"); font-weight: 700; font-style: normal; }
    @font-face { font-family: "Figtree"; src: url("${figtreeItalicUri}") format("truetype"); font-weight: 400; font-style: italic; }
    @font-face { font-family: "Newsreader"; src: url("${newsreaderRegularUri}") format("truetype"); font-weight: 400; font-style: normal; }
    @font-face { font-family: "Newsreader"; src: url("${newsreaderSemiBoldUri}") format("truetype"); font-weight: 500 600; font-style: normal; }
    @font-face { font-family: "Newsreader"; src: url("${newsreaderItalicUri}") format("truetype"); font-weight: 400; font-style: italic; }
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px 18px 88px;
      font: 16px/1.6 ${body};
      color: ${colors.ink};
      -webkit-text-size-adjust: 100%;
      word-wrap: break-word;
    }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.2em 0 .4em; }
    /* Headings follow the selected display family; the default reader surface is sans. */
    h1, h2, h3 { font-family: ${display}; font-weight: 500; letter-spacing: 0; }
    h4, h5, h6 { font-family: ${displaySans}; font-weight: 600; }
    h1 { font-size: 1.6em; } h2 { font-size: 1.35em; } h3 { font-size: 1.15em; }
    p { margin: .6em 0; }
    ul, ol { padding-left: 1.3em; margin: .6em 0; }
    li { margin: .2em 0; }
    a { color: ${colors.brand}; text-decoration: none; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    pre { background: ${colors.raised}; padding: 12px; border-radius: 10px; overflow: auto; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; background: ${colors.raised}; padding: .1em .3em; border-radius: 4px; }
    pre code { background: none; padding: 0; }
    blockquote { margin: .6em 0; padding-left: 12px; border-left: 3px solid ${colors.borderStrong}; color: ${colors.muted}; font-family: ${display}; font-style: italic; font-size: 1.0625em; }
    table { border-collapse: collapse; width: 100%; margin: .6em 0; font-size: .9em; }
    th, td { border: 1px solid ${colors.borderStrong}; padding: 6px 8px; text-align: left; }
    hr { border: none; border-top: 1px solid ${colors.borderStrong}; margin: 1.2em 0; }
  </style>
</head>
<body>${html}</body>
</html>`;
}

export function DocWebView({ html, fontStyle }: { html: string; fontStyle?: string | null }) {
  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html: buildDocument(html, normalizeDocFontStyle(fontStyle)) }}
      style={{ flex: 1, backgroundColor: "transparent" }}
      startInLoadingState
      renderLoading={() => (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingText}>Preparing document…</Text>
        </View>
      )}
      renderError={() => (
        <View style={styles.center}>
          <Text style={styles.errorText}>The document could not be displayed. Go back and try again.</Text>
        </View>
      )}
      // Read-only: open real links in the system browser instead of navigating
      // inside the reader. The initial in-memory document load is allowed.
      onShouldStartLoadWithRequest={(request) => {
        if (request.url.startsWith("http://") || request.url.startsWith("https://")) {
          void Linking.openURL(request.url).catch(() => {});
          return false;
        }
        return true;
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
    backgroundColor: colors.canvas,
  },
  loadingText: { color: colors.muted, fontFamily: "Figtree_500Medium", fontSize: 13 },
  errorText: {
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
