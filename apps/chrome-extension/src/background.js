// @ts-nocheck

const DEFAULT_API_URL = "https://api.dragonfruit.sh";
const DEFAULT_WEB_URL = "https://app.dragonfruit.sh";

const MENU_SAVE_PAGE = "dragonfruit-save-page";
const MENU_SAVE_LINK = "dragonfruit-save-link";
const MENU_SAVE_IMAGE = "dragonfruit-save-image";
const MENU_SETTINGS = "dragonfruit-settings";
const ACTION_ICON_IDLE = {
  16: "src/icons/action/icon-idle-16.png",
  32: "src/icons/action/icon-idle-32.png",
  48: "src/icons/action/icon-idle-48.png",
  128: "src/icons/action/icon-idle-128.png",
};
const ACTION_ICON_ACTIVE = {
  16: "src/icons/action/icon-active-16.png",
  32: "src/icons/action/icon-active-32.png",
  48: "src/icons/action/icon-active-48.png",
  128: "src/icons/action/icon-active-128.png",
};

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
  chrome.contextMenus.create({
    id: MENU_SETTINGS,
    title: "DragonFruit settings",
    contexts: ["action"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleContextMenu(info, tab);
});

chrome.action.onClicked.addListener((tab) => {
  void handleActionClick(tab);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SAVE_ACTIVE_TAB") {
    void respond(saveActiveTab(), sendResponse);
    return true;
  }
  if (message?.type === "SIGN_IN") {
    void respond(startSignIn(message.appUrl), sendResponse);
    return true;
  }
  if (message?.type === "SIGN_OUT") {
    void respond(signOut(), sendResponse);
    return true;
  }
  if (message?.type === "GET_AUTH_STATE") {
    void respond(getAuthState(message.appUrl), sendResponse);
    return true;
  }
  if (message?.type === "COMPLETE_PENDING_SIGN_IN") {
    void respond(completePendingSignIn(message.appUrl), sendResponse);
    return true;
  }
  if (message?.type === "LOAD_PROJECTS") {
    void respond(loadProjects(message.appUrl, message.workspaceSlug), sendResponse);
    return true;
  }
  return false;
});

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "DRAGONFRUIT_NATIVE_TOKEN") return false;
  void respond(completeExternalSignIn(message), sendResponse);
  return true;
});

async function respond(promise, sendResponse) {
  try {
    sendResponse(await promise);
  } catch (error) {
    sendResponse({ ok: false, error: error?.message || "DragonFruit request failed." });
  }
}

async function signIn() {
  const callbackUrl = `https://${chrome.runtime.id}.chromiumapp.org/auth/login-callback`;
  const sessionToken = await fetchNativeTokenFromSession(DEFAULT_API_URL, callbackUrl);
  if (sessionToken) {
    await persistToken(DEFAULT_API_URL, sessionToken);
    return { ok: true, pending: false };
  }

  const loginWindow = await chrome.windows.create({
    url: `${DEFAULT_WEB_URL}/native-login?callback=${encodeURIComponent(callbackUrl)}`,
    focused: true,
    height: 820,
    type: "normal",
    width: 1120,
  });
  if (!loginWindow?.id) throw new Error("DragonFruit login window could not be opened.");
  return { ok: true, pending: true };
}

async function completeExternalSignIn(message) {
  const appUrl = normalizeAppUrl(message.appUrl || DEFAULT_API_URL);
  const token = String(message.apiToken || "");
  if (!token) return { ok: false, error: "Missing DragonFruit API token." };
  await persistToken(appUrl, token);
  const user = await fetchCurrentUser(appUrl, token).catch(() => null);
  return { ok: true, user };
}

async function completePendingSignIn(appUrlValue) {
  const appUrl = normalizeAppUrl(appUrlValue || DEFAULT_API_URL);
  const callbackUrl = `https://${chrome.runtime.id}.chromiumapp.org/auth/login-callback`;
  const token = await fetchNativeTokenFromSession(appUrl, callbackUrl);
  if (!token) return { ok: false, pending: true };
  await persistToken(appUrl, token);
  const user = await fetchCurrentUser(appUrl, token).catch(() => null);
  return { ok: true, user };
}

async function fetchNativeTokenFromSession(appUrl, callbackUrl) {
  const response = await fetch(`${appUrl}/auth/native/start/?format=json&callback=${encodeURIComponent(callbackUrl)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!response) return "";

  if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
    const data = await response.json().catch(() => null);
    if (data?.api_token) return data.api_token;
    if (data?.callback) return extractApiToken(data.callback);
  }

  const tokenFromUrl = extractApiToken(response.url);
  if (tokenFromUrl) return tokenFromUrl;

  const html = await response.text().catch(() => "");
  if (!html) return "";

  const decodedHtml = html
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  const callbackMatch = decodedHtml.match(/https:\/\/[^"'<>\s]+\.chromiumapp\.org\/[^"'<>\s]*api_token=[^"'<>\s]+/);
  return callbackMatch ? extractApiToken(callbackMatch[0]) : "";
}

function extractApiToken(url) {
  try {
    return new URL(url).searchParams.get("api_token") || "";
  } catch {
    return "";
  }
}

async function persistToken(appUrl, token) {
  await chrome.storage.sync.set({ appUrl, apiToken: token, authStatus: "connected", authError: "" });
}

function isLocalAppUrl(appUrl) {
  try {
    const url = new URL(appUrl);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function startSignIn(appUrlValue) {
  const appUrl = normalizeAppUrl(appUrlValue || DEFAULT_API_URL);
  await chrome.storage.sync.set({ appUrl, authStatus: "pending", authError: "" });
  try {
    return await signIn();
  } catch (error) {
    const message = error?.message || "DragonFruit login failed.";
    await chrome.storage.sync.set({
      authStatus: "error",
      authError: message,
    });
    return { ok: false, error: message };
  }
}

async function signOut() {
  await chrome.storage.sync.remove([
    "apiToken",
    "workspaces",
    "workspaceSlug",
    "projects",
    "projectId",
    "authStatus",
    "authError",
  ]);
  return { ok: true };
}

async function getAuthState(appUrlValue) {
  const appUrl = normalizeAppUrl(appUrlValue || DEFAULT_API_URL);
  const { apiToken, authStatus, authError } = await chrome.storage.sync.get(["apiToken", "authStatus", "authError"]);
  if (!apiToken) {
    return {
      ok: true,
      authenticated: false,
      pending: authStatus === "pending",
      error: authStatus === "error" ? authError || "DragonFruit login failed." : "",
    };
  }
  try {
    const user = await fetchCurrentUser(appUrl, apiToken);
    await chrome.storage.sync.set({ authStatus: "connected", authError: "" });
    return { ok: true, authenticated: true, user };
  } catch (error) {
    if (authStatus === "connected") {
      return {
        ok: true,
        authenticated: true,
        user: null,
        warning: error?.message || "Could not refresh DragonFruit account.",
      };
    }
    await chrome.storage.sync.remove(["apiToken"]);
    return { ok: true, authenticated: false, error: "Saved DragonFruit session expired." };
  }
}

async function fetchCurrentUser(appUrl, apiToken) {
  const response = await fetch(`${appUrl}/api/users/me/`, {
    headers: authorizedHeaders(apiToken),
  });
  if (!response.ok) throw new Error(`User lookup failed: ${response.status}`);
  return response.json();
}

async function loadProjects(appUrlValue, workspaceSlugValue) {
  const appUrl = normalizeAppUrl(appUrlValue || DEFAULT_API_URL);
  const workspaceSlug = String(workspaceSlugValue || "").trim();
  const { apiToken } = await chrome.storage.sync.get(["apiToken"]);
  if (!apiToken) return { ok: false, error: "Sign in first." };
  if (!workspaceSlug) return { ok: false, error: "Enter workspace slug." };
  const response = await fetch(`${appUrl}/api/workspaces/${workspaceSlug}/bookmark-extension/context/`, {
    headers: authorizedHeaders(apiToken),
  });
  if (!response.ok) return { ok: false, error: `Could not load projects: ${response.status}` };
  return { ok: true, data: await response.json() };
}

async function handleContextMenu(info, tab) {
  if (info.menuItemId === MENU_SETTINGS) {
    await openSettings("context-menu");
    return;
  }

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

async function handleActionClick(tab) {
  if (!tab?.id || !tab?.url) return;
  await setActionIcon("active", tab.id);
  try {
    const authState = await getAuthState(DEFAULT_API_URL);
    if (!authState.authenticated) {
      await showTabToast(tab.id, authState.error || "Connect your DragonFruit account first.", "error");
      return;
    }
    await saveUrlBookmark(tab.url, tab);
    await showTabToast(tab.id, "Saved to DragonFruit", "success");
  } catch (error) {
    const message = String(error?.message || "Could not save to DragonFruit.");
    if (isPermissionError(message)) {
      await showTabToast(tab.id, "No write access for selected project. Choose another project.", "error");
    } else {
      await showTabToast(tab.id, message, "error");
    }
  } finally {
    await delay(850);
    await setActionIcon("idle", tab.id);
  }
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
  if (!settings.apiToken) {
    throw new Error("Connect your DragonFruit account first.");
  }
  if (!settings.workspaceSlug || !settings.projectId) {
    throw new Error("Choose a workspace and project in the extension popup first.");
  }

  const user = await fetchCurrentUser(settings.appUrl, settings.apiToken).catch(() => null);
  const payloadWithAudit = {
    ...payload,
    ...(user?.id ? { updated_by: user.id } : {}),
  };

  let response = await fetch(
    `${settings.appUrl}/api/workspaces/${settings.workspaceSlug}/projects/${settings.projectId}/bookmarks/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authorizedHeaders(settings.apiToken),
        "X-DragonFruit-Source": "chrome-extension",
      },
      body: JSON.stringify(payloadWithAudit),
    }
  );

  if (response.status === 403) {
    const recoveredSettings = await recoverWritableProject(settings);
    if (recoveredSettings) {
      response = await fetch(
        `${recoveredSettings.appUrl}/api/workspaces/${recoveredSettings.workspaceSlug}/projects/${recoveredSettings.projectId}/bookmarks/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authorizedHeaders(recoveredSettings.apiToken),
            "X-DragonFruit-Source": "chrome-extension",
          },
          body: JSON.stringify(payloadWithAudit),
        }
      );
    }
  }

  if (!response.ok) throw new Error(await bookmarkErrorMessage(response));
  return response.json();
}

async function recoverWritableProject(settings) {
  if (!settings.workspaceSlug) return null;
  const loaded = await loadProjects(settings.appUrl, settings.workspaceSlug);
  if (!loaded?.ok) return null;

  const projects = loaded.data?.projects || [];
  if (!projects.length) return null;

  const defaultProjectId = String(loaded.data?.default_project_id || "");
  const fallbackProjectId = String(projects[0]?.id || "");
  const projectId = defaultProjectId || fallbackProjectId;
  if (!projectId) return null;

  await chrome.storage.sync.set({
    projects,
    projectId,
    workspaceSlug: settings.workspaceSlug,
  });

  return {
    ...settings,
    projectId,
  };
}

async function bookmarkErrorMessage(response) {
  const fallback = `Bookmark failed: ${response.status}`;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null);
    const detail = data?.error || data?.detail || data?.message;
    if (detail) return `${fallback} - ${formatErrorDetail(detail)}`;
  }

  const text = await response.text().catch(() => "");
  return text ? `${fallback} - ${text.slice(0, 200)}` : fallback;
}

function formatErrorDetail(detail) {
  if (Array.isArray(detail)) return detail.join(", ");
  if (typeof detail === "object") return Object.values(detail).flat().join(", ");
  return String(detail);
}

async function openSettings(reason = "") {
  if (reason !== "context-menu") return;
  await chrome.storage.session?.set({ popupView: "settings" });
  await chrome.tabs.create({ url: chrome.runtime.getURL("src/popup.html?view=settings"), active: true });
}

async function showTabToast(tabId, message, state = "success") {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [String(message || ""), state],
      func: (toastMessage, toastState) => {
        const TOAST_ID = "dragonfruit-extension-toast";
        const STYLE_ID = "dragonfruit-extension-toast-style";
        if (!toastMessage) return;

        if (!document.getElementById(STYLE_ID)) {
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = `
            #${TOAST_ID} {
              position: fixed;
              right: 18px;
              bottom: 18px;
              z-index: 2147483647;
              max-width: 320px;
              border-radius: 12px;
              padding: 10px 14px;
              color: #ffffff;
              font: 600 13px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
              box-shadow: 0 10px 26px rgba(0, 0, 0, 0.24);
              transform: translateY(8px);
              opacity: 0;
              transition: opacity 0.18s ease, transform 0.18s ease;
              pointer-events: none;
            }
            #${TOAST_ID}[data-state="success"] { background: #1f9d74; }
            #${TOAST_ID}[data-state="error"] { background: #d93f53; }
            #${TOAST_ID}[data-visible="true"] {
              opacity: 1;
              transform: translateY(0);
            }
          `;
          document.documentElement.append(style);
        }

        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
          toast = document.createElement("div");
          toast.id = TOAST_ID;
          document.body.append(toast);
        }

        toast.textContent = toastMessage;
        toast.dataset.state = toastState === "error" ? "error" : "success";
        toast.dataset.visible = "true";
        window.setTimeout(() => {
          const latestToast = document.getElementById(TOAST_ID);
          if (!latestToast) return;
          latestToast.dataset.visible = "false";
        }, 1700);
      },
    });
  } catch {
    // Script injection fails on restricted pages (chrome://, extensions, etc).
  }
}

async function setActionIcon(state, tabId) {
  const path = state === "active" ? ACTION_ICON_ACTIVE : ACTION_ICON_IDLE;
  try {
    if (tabId) {
      await chrome.action.setIcon({ tabId, path });
      return;
    }
    await chrome.action.setIcon({ path });
  } catch {
    // Ignore icon update failures to keep save flow resilient.
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const stored = await chrome.storage.sync.get(["appUrl", "workspaceSlug", "projectId", "apiToken"]);
  return {
    appUrl: normalizeAppUrl(stored.appUrl || DEFAULT_API_URL),
    workspaceSlug: stored.workspaceSlug || "",
    projectId: stored.projectId || "",
    apiToken: stored.apiToken || "",
  };
}

function authorizedHeaders(apiToken) {
  return apiToken ? { "X-Api-Key": apiToken } : {};
}

function normalizeAppUrl(value) {
  const url = String(value || DEFAULT_API_URL).replace(/\/+$/, "");
  return isLocalAppUrl(url) ? DEFAULT_API_URL : url;
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

function isPermissionError(message) {
  const normalizedMessage = String(message || "").toLowerCase();
  return normalizedMessage.includes("403") || normalizedMessage.includes("required permissions");
}
