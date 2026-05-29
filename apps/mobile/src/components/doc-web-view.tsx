import { Linking } from "react-native";
import { WebView } from "react-native-webview";

/**
 * Read-only renderer for a page's `description_html`. We hand the exact HTML the
 * web editor produces to a WebView with a clean typographic reset — far higher
 * fidelity (tables, code blocks, images, callouts) than re-implementing a
 * React Native HTML parser, and it scrolls as a natural reader.
 */
function buildDocument(html: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px 18px 56px;
      font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1f2230;
      -webkit-text-size-adjust: 100%;
      word-wrap: break-word;
    }
    h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 .4em; font-weight: 600; }
    h1 { font-size: 1.6em; } h2 { font-size: 1.35em; } h3 { font-size: 1.15em; }
    p { margin: .6em 0; }
    ul, ol { padding-left: 1.3em; margin: .6em 0; }
    li { margin: .2em 0; }
    a { color: #e445a6; text-decoration: none; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    pre { background: #f4f5fb; padding: 12px; border-radius: 10px; overflow: auto; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; background: #f4f5fb; padding: .1em .3em; border-radius: 4px; }
    pre code { background: none; padding: 0; }
    blockquote { margin: .6em 0; padding-left: 12px; border-left: 3px solid #e6e6ef; color: #5d6274; }
    table { border-collapse: collapse; width: 100%; margin: .6em 0; font-size: .9em; }
    th, td { border: 1px solid #e6e6ef; padding: 6px 8px; text-align: left; }
    hr { border: none; border-top: 1px solid #e6e6ef; margin: 1.2em 0; }
  </style>
</head>
<body>${html}</body>
</html>`;
}

export function DocWebView({ html }: { html: string }) {
  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html: buildDocument(html) }}
      style={{ flex: 1, backgroundColor: "transparent" }}
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
