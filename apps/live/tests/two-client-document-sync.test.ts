/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { Hocuspocus } from "@hocuspocus/server";
import { describe, it } from "vitest";
import WebSocketImplementation from "ws";
import * as Y from "yjs";

const waitForText = (doc: Y.Doc, field: string, expected: string, timeoutMs = 2_000) =>
  new Promise<void>((resolve, reject) => {
    const text = doc.getText(field);
    if (text.toString() === expected) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      text.unobserve(onChange);
      reject(new Error(`Timed out waiting for ${field}="${expected}", received "${text.toString()}"`));
    }, timeoutMs);
    const onChange = () => {
      if (text.toString() !== expected) return;
      clearTimeout(timeout);
      text.unobserve(onChange);
      resolve();
    };
    text.observe(onChange);
  });

const createProvider = (url: string, document: Y.Doc, onSynced: () => void) => {
  const websocketProvider = new HocuspocusProviderWebsocket({
    url,
    WebSocketPolyfill: WebSocketImplementation,
  });

  return new HocuspocusProvider({
    name: "atlas-two-client-doc",
    document,
    websocketProvider,
    broadcast: false,
    quiet: true,
    onSynced,
  });
};

describe("two-client Atlas document collaboration", () => {
  it("converges title and body edits and reloads them after reconnect", async () => {
    const server = new Hocuspocus({ port: 0, quiet: true, debounce: 0 });
    await server.listen();
    const url = `ws://127.0.0.1:${server.address.port}`;
    const firstDocument = new Y.Doc();
    const secondDocument = new Y.Doc();
    let firstProvider: HocuspocusProvider | undefined;
    let secondProvider: HocuspocusProvider | undefined;
    let reloadedProvider: HocuspocusProvider | undefined;

    try {
      const firstSynced = new Promise<void>((resolve) => {
        firstProvider = createProvider(url, firstDocument, resolve);
      });
      await firstSynced;

      firstDocument.transact(() => {
        firstDocument.getText("title").insert(0, "Renji launch brief");
        firstDocument.getText("default").insert(0, "Notes about Renji and the launch.");
      });

      const secondSynced = new Promise<void>((resolve) => {
        secondProvider = createProvider(url, secondDocument, resolve);
      });
      await secondSynced;
      await Promise.all([
        waitForText(secondDocument, "title", "Renji launch brief"),
        waitForText(secondDocument, "default", "Notes about Renji and the launch."),
      ]);

      // Accepting the Atlas proposal updates both real collaborative fields in
      // one Yjs transaction. The second client must see the same document.
      firstDocument.transact(() => {
        const title = firstDocument.getText("title");
        const body = firstDocument.getText("default");
        title.delete(0, title.length);
        title.insert(0, "Rengi launch brief");
        body.delete(0, body.length);
        body.insert(0, "Notes about Rengi and the launch.");
      });
      await Promise.all([
        waitForText(secondDocument, "title", "Rengi launch brief"),
        waitForText(secondDocument, "default", "Notes about Rengi and the launch."),
      ]);

      secondProvider?.destroy();
      secondProvider = undefined;
      secondDocument.destroy();

      const reloadedDocument = new Y.Doc();
      const reloadedSynced = new Promise<void>((resolve) => {
        reloadedProvider = createProvider(url, reloadedDocument, resolve);
      });
      await reloadedSynced;
      await Promise.all([
        waitForText(reloadedDocument, "title", "Rengi launch brief"),
        waitForText(reloadedDocument, "default", "Notes about Rengi and the launch."),
      ]);
      reloadedDocument.destroy();
    } finally {
      firstProvider?.destroy();
      secondProvider?.destroy();
      reloadedProvider?.destroy();
      firstDocument.destroy();
      if (!secondDocument.isDestroyed) secondDocument.destroy();
      await server.destroy();
    }
  });
});
