import * as WebBrowser from "expo-web-browser";

import { APP_HOST } from "./config";

/**
 * Open a route on the web app inside the in-app browser (SFSafariViewController
 * on iOS). Used for surfaces we deliberately don't render natively yet — e.g.
 * whiteboards (canvas) and workspace-level pages — so no control is a dead end.
 */
export function openWeb(pathOrUrl: string): void {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${APP_HOST}/${pathOrUrl.replace(/^\/+/, "")}`;
  void WebBrowser.openBrowserAsync(url).catch(() => {});
}
