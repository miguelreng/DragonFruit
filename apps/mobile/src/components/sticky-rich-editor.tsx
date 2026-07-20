import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Image, StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export type StickyFormatCommand = "bold" | "italic" | "bulletList" | "numberedList" | "code";

export type StickyFormatState = {
  bold: boolean;
  italic: boolean;
  bulletList: boolean;
  numberedList: boolean;
  code: boolean;
};

export const EMPTY_STICKY_FORMAT_STATE: StickyFormatState = {
  bold: false,
  italic: false,
  bulletList: false,
  numberedList: false,
  code: false,
};

const figtreeRegularUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-Regular.ttf")).uri;
const figtreeMediumUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-Medium.ttf")).uri;
const figtreeSemiBoldUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-SemiBold.ttf")).uri;
const figtreeBoldUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-Bold.ttf")).uri;
const figtreeItalicUri = Image.resolveAssetSource(require("../../assets/fonts/Figtree-Italic.ttf")).uri;

export type StickyRichEditorHandle = {
  focus: () => void;
  blur: () => void;
  runCommand: (command: StickyFormatCommand) => void;
};

type StickyRichEditorProps = {
  initialHtml: string;
  accessibilityLabel: string;
  autoFocus?: boolean;
  onChangeHtml: (html: string) => void;
  onFormatStateChange?: (state: StickyFormatState) => void;
};

function safeScriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function editorDocument(initialHtml: string, autoFocus: boolean): string {
  const initial = safeScriptString(initialHtml.trim() || "<p><br></p>");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    @font-face { font-family: "Figtree"; src: url("${figtreeRegularUri}") format("truetype"); font-weight: 400; font-style: normal; }
    @font-face { font-family: "Figtree"; src: url("${figtreeMediumUri}") format("truetype"); font-weight: 500; font-style: normal; }
    @font-face { font-family: "Figtree"; src: url("${figtreeSemiBoldUri}") format("truetype"); font-weight: 600; font-style: normal; }
    @font-face { font-family: "Figtree"; src: url("${figtreeBoldUri}") format("truetype"); font-weight: 700; font-style: normal; }
    @font-face { font-family: "Figtree"; src: url("${figtreeItalicUri}") format("truetype"); font-weight: 400; font-style: italic; }
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: transparent; }
    body {
      padding: 26px 24px 36px;
      color: #1d1f20;
      font: 18px/1.45 "Figtree", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
      -webkit-text-size-adjust: 100%;
    }
    #editor { min-height: calc(100vh - 62px); outline: none; overflow-wrap: anywhere; }
    #editor:empty::before { content: "Write a note…"; color: rgba(29,31,32,.38); }
    p { margin: 0 0 .55em; }
    ul, ol { margin: .45em 0; padding-left: 1.25em; }
    li { margin: .18em 0; }
    /* Tiptap task lists render a checkbox label beside a content div. Remove
       the unordered-list marker and reserve the checkbox column so the text
       starts on the same line instead of dropping below it. */
    ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    ul[data-type="taskList"] li {
      position: relative;
      list-style: none;
      padding-left: 1.35rem;
    }
    ul[data-type="taskList"] li::marker { content: ""; }
    ul[data-type="taskList"] li > label {
      position: absolute;
      top: .15em;
      left: 0;
      display: flex;
      align-items: center;
      margin: 0;
      user-select: none;
    }
    ul[data-type="taskList"] li > label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: #e548a5;
    }
    ul[data-type="taskList"] li > div { margin-left: 0; }
    ul[data-type="taskList"] li > div > p { margin-top: 0; }
    pre {
      margin: .55em 0;
      padding: 9px 10px;
      border-radius: 8px;
      background: rgba(255,255,255,.34);
      font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="editor" contenteditable="true" role="textbox" aria-multiline="true"></div>
  <script>
    const editor = document.getElementById("editor");
    editor.innerHTML = ${initial};
    let savedRange = null;

    function selectionBelongsToEditor() {
      const selection = window.getSelection();
      return !!selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode);
    }

    function saveSelection() {
      const selection = window.getSelection();
      if (selectionBelongsToEditor()) savedRange = selection.getRangeAt(0).cloneRange();
    }

    function restoreSelection() {
      if (!savedRange) return;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }

    function formatState() {
      const selection = window.getSelection();
      const node = selection && selection.anchorNode;
      const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
      return {
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        bulletList: document.queryCommandState("insertUnorderedList"),
        numberedList: document.queryCommandState("insertOrderedList"),
        code: !!(element && element.closest && element.closest("pre")),
      };
    }

    function post(type, payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
    }

    function emitChange() {
      post("change", { html: editor.innerHTML });
      post("format", { state: formatState() });
    }

    editor.addEventListener("input", () => {
      saveSelection();
      emitChange();
    });
    editor.addEventListener("keyup", () => {
      saveSelection();
      post("format", { state: formatState() });
    });
    editor.addEventListener("mouseup", () => {
      saveSelection();
      post("format", { state: formatState() });
    });
    document.addEventListener("selectionchange", saveSelection);

    window.__dragonfruitFocus = function () {
      editor.focus();
      restoreSelection();
    };
    window.__dragonfruitBlur = function () {
      editor.blur();
      const selection = window.getSelection();
      selection && selection.removeAllRanges();
    };
    window.__dragonfruitCommand = function (command) {
      editor.focus();
      restoreSelection();
      if (command === "bulletList") document.execCommand("insertUnorderedList", false, null);
      else if (command === "numberedList") document.execCommand("insertOrderedList", false, null);
      else if (command === "code") {
        const active = formatState().code;
        document.execCommand("formatBlock", false, active ? "p" : "pre");
      } else document.execCommand(command, false, null);
      saveSelection();
      emitChange();
    };
    ${autoFocus ? "requestAnimationFrame(() => window.__dragonfruitFocus());" : ""}
  </script>
</body>
</html>`;
}

export const StickyRichEditor = forwardRef<StickyRichEditorHandle, StickyRichEditorProps>(function StickyRichEditor(
  { initialHtml, accessibilityLabel, autoFocus = false, onChangeHtml, onFormatStateChange },
  forwardedRef
) {
  const webViewRef = useRef<WebView>(null);
  const firstHtml = useRef(initialHtml);
  const source = useMemo(() => ({ html: editorDocument(firstHtml.current, autoFocus) }), [autoFocus]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus: () => webViewRef.current?.injectJavaScript("window.__dragonfruitFocus(); true;"),
      blur: () => webViewRef.current?.injectJavaScript("window.__dragonfruitBlur(); true;"),
      runCommand: (command) =>
        webViewRef.current?.injectJavaScript(`window.__dragonfruitCommand(${JSON.stringify(command)}); true;`),
    }),
    []
  );

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as
        | { type: "change"; html: string }
        | { type: "format"; state: StickyFormatState };
      if (message.type === "change") onChangeHtml(message.html);
      else if (message.type === "format") onFormatStateChange?.(message.state);
    } catch {
      // Ignore messages that do not belong to the editor bridge.
    }
  };

  return (
    <WebView
      ref={webViewRef}
      source={source}
      originWhitelist={["about:blank"]}
      onMessage={onMessage}
      style={styles.webView}
      containerStyle={styles.container}
      scrollEnabled
      bounces
      hideKeyboardAccessoryView
      keyboardDisplayRequiresUserAction={false}
      automaticallyAdjustContentInsets={false}
      accessibilityLabel={accessibilityLabel}
    />
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  webView: { flex: 1, backgroundColor: "transparent", opacity: 0.99 },
});
