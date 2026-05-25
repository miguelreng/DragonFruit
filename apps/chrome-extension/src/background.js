// @ts-nocheck

const DEFAULT_APP_URL = "http://localhost:3000";

const MENU_SAVE_PAGE = "dragonfruit-save-page";
const MENU_SAVE_LINK = "dragonfruit-save-link";
const MENU_SAVE_IMAGE = "dragonfruit-save-image";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_SAVE_PAGE,
    title: "Save page to DragonFruit",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: MENU_SAVE_LINK,
    title: "Save link to DragonFruit",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: MENU_SAVE_IMAGE,
    title: "Save image to DragonFruit",
    contexts: ["image"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleContextMenu(info, tab);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SAVE_ACTIVE_TAB") return false;
  void saveActiveTab().then(sendResponse);
  return true;
});

async function handleContextMenu(info, tab) {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_SAVE_IMAGE && info.srcUrl) {
    await saveBookmark({
      title: titleFromUrl(info.srcUrl, "Saved image"),
      url: info.srcUrl,
      description: tab.title ? `Saved from ${tab.title}` : "",
      tags: ["image"],
      metadata: {
        image_url: info.srcUrl,
        source_url: tab.url || "",
        source_app: "DragonFruit Chrome Extension",
        site_name: "Image",
      },
    });
    return;
  }

  const url = info.linkUrl || tab.url || "";
  if (!url) return;
  await saveUrlBookmark(url, tab);
}

async function saveActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return { ok: false, error: "No active tab URL." };
  await saveUrlBookmark(tab.url, tab);
  return { ok: true };
}

async function saveUrlBookmark(url, tab) {
  const isTweet = /https?:\/\/(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(url);
  const metadata = {
    source_url: url,
    source_app: "DragonFruit Chrome Extension",
    favicon_url: tab?.favIconUrl || "",
    site_name: isTweet ? "Tweet" : domainFromUrl(url),
  };
  const tags = isTweet ? ["tweet"] : [];

  if (isTweet && tab?.id && tab.url && sameUrl(tab.url, url)) {
    const screenshot = await captureTweetScreenshot(tab.id).catch(() => "");
    if (screenshot) {
      metadata.image_url = screenshot;
      metadata.screenshot_source = "chrome_extension";
    }
  }

  await saveBookmark({
    title: tab?.title || titleFromUrl(url, "Saved bookmark"),
    url,
    description: "",
    tags,
    metadata,
  });
}

async function saveBookmark(payload) {
  const settings = await getSettings();
  if (!settings.workspaceSlug || !settings.projectId) {
    await chrome.runtime.openOptionsPage?.();
    throw new Error("Choose a workspace and project in the extension popup first.");
  }
  const csrfToken = await getCsrfToken(settings.appUrl);
  const response = await fetch(
    `${settings.appUrl}/api/workspaces/${settings.workspaceSlug}/projects/${settings.projectId}/bookmarks/`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) throw new Error(`Bookmark failed: ${response.status}`);
  return response.json();
}

async function captureTweetScreenshot(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const article = document.querySelector('article[data-testid="tweet"]') || document.querySelector("article");
      if (!article) return null;
      article.scrollIntoView({ block: "center", inline: "center" });
      const rect = article.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      return {
        x: Math.max(0, rect.left * scale),
        y: Math.max(0, rect.top * scale),
        width: Math.max(1, rect.width * scale),
        height: Math.max(1, rect.height * scale),
      };
    },
  });
  if (!result) return "";

  const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
  const blob = await (await fetch(dataUrl)).blob();
  const image = await createImageBitmap(blob);
  const width = Math.min(result.width, image.width - result.x);
  const height = Math.min(result.height, image.height - result.y);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(image, result.x, result.y, width, height, 0, 0, width, height);
  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataUrl(croppedBlob);
}

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(["appUrl", "workspaceSlug", "projectId"]);
  return {
    appUrl: normalizeAppUrl(stored.appUrl || DEFAULT_APP_URL),
    workspaceSlug: stored.workspaceSlug || "",
    projectId: stored.projectId || "",
  };
}

async function getCsrfToken(appUrl) {
  const cookies = await chrome.cookies?.get?.({ url: appUrl, name: "csrftoken" });
  return cookies?.value || "";
}

function normalizeAppUrl(value) {
  return String(value || DEFAULT_APP_URL).replace(/\/+$/, "");
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}

function titleFromUrl(url, fallback) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/");
    let last = "";
    for (let index = pathParts.length - 1; index >= 0; index -= 1) {
      if (pathParts[index]) {
        last = pathParts[index];
        break;
      }
    }
    return last ? decodeURIComponent(last).replace(/[-_]+/g, " ") : parsed.hostname;
  } catch {
    return fallback;
  }
}

function sameUrl(a, b) {
  try {
    const first = new URL(a);
    const second = new URL(b);
    return first.origin === second.origin && first.pathname === second.pathname;
  } catch {
    return a === b;
  }
}
