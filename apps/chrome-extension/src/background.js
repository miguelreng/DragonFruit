// @ts-nocheck

const DEFAULT_API_URL = "https://api.dragonfruit.sh";
const DEFAULT_WEB_URL = "https://app.dragonfruit.sh";

const MENU_SAVE_PAGE = "dragonfruit-save-page";
const MENU_SAVE_LINK = "dragonfruit-save-link";
const MENU_SAVE_IMAGE = "dragonfruit-save-image";
const MENU_SETTINGS = "dragonfruit-settings";
const SAVED_PAGE_URLS_KEY = "savedPageUrls";
const MAX_SAVED_PAGE_URLS = 500;
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
const actionIconImageDataCache = {};

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
  void updateActiveTabActionIcon();
});

chrome.runtime.onStartup.addListener(() => {
  void updateActiveTabActionIcon();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleContextMenu(info, tab);
});

chrome.action.onClicked.addListener((tab) => {
  void handleActionClick(tab);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void updateActionIconForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    void updateActionIconForTab(tabId, tab?.url || changeInfo.url);
  }
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
      await openExtensionView("login", tab.id);
      await updateActionIconForTab(tab.id, tab.url);
      return;
    }
    await showTabToast(tab.id, "Saving to DragonFruit...", "loading");
    await saveUrlBookmark(tab.url, tab);
    await showTabToast(tab.id, "Saved to DragonFruit", "success");
  } catch (error) {
    const message = String(error?.message || "Could not save to DragonFruit.");
    if (isAuthenticationError(message)) {
      await openExtensionView("login", tab.id);
    } else if (isConfigurationError(message)) {
      await openExtensionView("settings", tab.id);
    } else if (isPermissionError(message)) {
      await showTabToast(tab.id, "No write access for selected project. Choose another project.", "error");
    } else {
      await showTabToast(tab.id, message, "error");
    }
    await updateActionIconForTab(tab.id, tab.url);
  }
}

async function saveUrlBookmark(url, tab) {
  const isTweet = /https?:\/\/(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(url);
  const pageMetadata =
    tab?.id && tab.url && sameUrl(tab.url, url) ? await extractPageMetadata(tab.id, url).catch(() => ({})) : {};
  const metadata = {
    source_url: pageMetadata.url || url,
    source_app: "DragonFruit Chrome Extension",
    favicon_url: pageMetadata.favicon_url || tab?.favIconUrl || "",
    site_name: isTweet ? "Tweet" : pageMetadata.site_name || domainFromUrl(url),
  };
  if (pageMetadata.image_url) metadata.image_url = pageMetadata.image_url;
  if (pageMetadata.title) metadata.og_title = pageMetadata.title;
  if (pageMetadata.description) metadata.og_description = pageMetadata.description;
  if (pageMetadata.url) metadata.og_url = pageMetadata.url;

  const tags = isTweet ? ["tweet"] : [];

  if (isTweet && tab?.id && tab.url && sameUrl(tab.url, url)) {
    const screenshot = await captureTweetScreenshot(tab.id).catch(() => "");
    if (screenshot) {
      metadata.image_url = screenshot;
      metadata.screenshot_source = "chrome_extension";
    }
  }

  await saveBookmark({
    title: pageMetadata.title || tab?.title || titleFromUrl(url, "Saved bookmark"),
    url,
    description: pageMetadata.description || "",
    tags,
    metadata,
  });

  if (tab?.id && tab.url && getSavedPageUrlKey(tab.url) === getSavedPageUrlKey(url)) {
    await markPageUrlSaved(url, tab.id);
  }
}

async function extractPageMetadata(tabId, fallbackUrl) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [fallbackUrl],
    func: (pageUrl) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper is serialized into the page.
      const content = (...selectors) => {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          const value = element?.getAttribute("content") || element?.getAttribute("href") || "";
          if (value.trim()) return value.trim();
        }
        return "";
      };
      const absoluteUrl = (value) => {
        if (!value) return "";
        try {
          return new URL(value, document.baseURI || pageUrl).href;
        } catch {
          return value;
        }
      };
      const siteName = content('meta[property="og:site_name"]', 'meta[name="application-name"]');
      const title = content('meta[property="og:title"]', 'meta[name="twitter:title"]') || document.title || "";
      const description =
        content('meta[property="og:description"]', 'meta[name="twitter:description"]', 'meta[name="description"]') ||
        "";
      const imageUrl = content(
        'meta[property="og:image:secure_url"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]'
      );
      const canonicalUrl = content('meta[property="og:url"]', 'link[rel="canonical"]');
      const faviconUrl = content(
        'link[rel="apple-touch-icon"]',
        'link[rel="icon"]',
        'link[rel="shortcut icon"]',
        'link[rel="mask-icon"]'
      );

      return {
        title,
        description,
        image_url: absoluteUrl(imageUrl),
        favicon_url: absoluteUrl(faviconUrl),
        site_name: siteName,
        url: absoluteUrl(canonicalUrl),
      };
    },
  });
  return normalizePageMetadata(result?.result);
}

function normalizePageMetadata(value) {
  if (!value || typeof value !== "object") return {};
  return {
    title: stringValue(value.title),
    description: stringValue(value.description),
    image_url: stringValue(value.image_url),
    favicon_url: stringValue(value.favicon_url),
    site_name: stringValue(value.site_name),
    url: stringValue(value.url),
  };
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
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
  await openExtensionView("settings");
}

async function openExtensionView(view = "bookmark", tabId = null) {
  const normalizedView = view === "login" || view === "settings" ? view : "bookmark";
  const popupPath = `src/popup.html?view=${normalizedView}`;
  await chrome.storage.session?.set({ popupView: normalizedView });
  if (chrome.action?.openPopup) {
    try {
      if (tabId) await chrome.action.setPopup({ tabId, popup: popupPath });
      await chrome.action.openPopup();
      if (tabId) {
        setTimeout(() => {
          void chrome.action.setPopup({ tabId, popup: "" }).catch(() => {});
        }, 1000);
      }
      return;
    } catch {
      if (tabId) await chrome.action.setPopup({ tabId, popup: "" }).catch(() => {});
      // Fall back to a dedicated extension tab when Chrome cannot open the popup.
    }
  }
  await chrome.tabs.create({
    url: chrome.runtime.getURL(popupPath),
    active: true,
  });
}

function isAuthenticationError(message) {
  return String(message || "")
    .toLowerCase()
    .includes("connect your dragonfruit account");
}

function isConfigurationError(message) {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("choose a workspace") || normalized.includes("select workspace");
}

async function showTabToast(tabId, message, state = "success") {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [String(message || ""), state, chrome.runtime.getURL("src/fonts/Newsreader-Variable.ttf")],
      func: (toastMessage, toastState, fontUrl) => {
        const TOAST_ID = "dragonfruit-extension-toast";
        if (!toastMessage) return;
        const normalizedState = toastState === "error" || toastState === "loading" ? toastState : "success";
        const toastToken = String(Date.now());
        const iconMarkup = {
          success: `
            <svg class="status-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6.5 9.5 17 4 11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          `,
          loading: "",
          error: `
            <svg class="status-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
            </svg>
          `,
        }[normalizedState];

        let host = document.getElementById(TOAST_ID);
        if (!host) {
          host = document.createElement("div");
          host.id = TOAST_ID;
          document.documentElement.append(host);
          host.attachShadow({ mode: "open" });
        } else if (!host.shadowRoot) {
          host.textContent = "";
          host.attachShadow({ mode: "open" });
        }

        const root = host.shadowRoot;
        if (!root) return;
        host.dataset.toastToken = toastToken;
        root.innerHTML = `
          <style>
            @font-face {
              font-family: Newsreader;
              src: url("${fontUrl}") format("truetype");
              font-style: normal;
              font-weight: 300 800;
              font-display: swap;
            }
            :host {
              all: initial;
              --bg-surface-1: oklch(1 0 0);
              --bg-success-subtle: oklch(0.9819 0.0181 155.83);
              --bg-accent-subtle: oklch(0.9847 0.0092 347.17);
              --bg-danger-subtle: oklch(0.9705 0.0129 17.38);
              --border-strong: oklch(0.8925 0.0024 230.7);
              --txt-primary: oklch(0.2378 0.0029 230.83);
              --txt-icon-success-primary: oklch(0.4468 0.1187 151.4);
              --txt-icon-accent-primary: oklch(0.4901 0.2056 347.17);
              --txt-icon-danger-primary: oklch(0.4446 0.1774 26.79);
              --shadow-raised-200: 0px 1px 2px -1px #292f3d0f, 0px 1px 3px 0px #292f3d0d;
              position: fixed;
              right: 18px;
              top: 18px;
              z-index: 2147483647;
              width: min(320px, calc(100vw - 36px));
              color-scheme: light;
              pointer-events: none;
            }
            .toast {
              box-sizing: border-box;
              display: flex;
              width: 100%;
              min-height: 52px;
              align-items: center;
              gap: 10px;
              border: 0.5px solid var(--border-strong);
              border-radius: 18px;
              background: var(--bg-surface-1);
              padding: 10px 12px;
              box-shadow: var(--shadow-raised-200);
              transform: translateY(-8px);
              opacity: 0;
              transition: opacity 0.16s ease, transform 0.16s ease;
              pointer-events: auto;
            }
            .toast[data-visible="true"] {
              opacity: 1;
              transform: translateY(0);
            }
            .icon {
              box-sizing: border-box;
              display: grid;
              flex: 0 0 auto;
              place-items: center;
              width: 24px;
              height: 24px;
              border-radius: 999px;
              background: var(--bg-success-subtle);
              color: var(--txt-icon-success-primary);
            }
            .icon[data-state="error"] {
              background: var(--bg-danger-subtle);
              color: var(--txt-icon-danger-primary);
            }
            .icon[data-state="loading"] {
              display: none;
            }
            .status-icon {
              width: 15px;
              height: 15px;
            }
            .status-icon.is-loading {
              animation: dragonfruit-toast-spin 0.9s linear infinite;
              transform-origin: center;
            }
            @keyframes dragonfruit-toast-spin {
              to { transform: rotate(360deg); }
            }
            .content {
              box-sizing: border-box;
              display: flex;
              min-width: 0;
              flex: 1 1 auto;
              flex-direction: column;
              gap: 8px;
            }
            .message {
              margin: 0;
              color: var(--txt-primary);
              font: 400 16px/1.2 Newsreader, ui-serif, Georgia, serif;
              letter-spacing: 0;
            }
          </style>
          <div class="toast" data-visible="false">
            ${
              normalizedState === "loading"
                ? ""
                : `<span class="icon" data-state="${normalizedState}" aria-hidden="true">${iconMarkup}</span>`
            }
            <div class="content">
              <p class="message"></p>
            </div>
          </div>
        `;

        const toast = root.querySelector(".toast");
        const messageElement = root.querySelector(".message");
        if (!toast || !messageElement) return;
        messageElement.textContent = toastMessage;

        requestAnimationFrame(() => {
          toast.dataset.visible = "true";
        });
        if (normalizedState === "loading") return;
        window.setTimeout(() => {
          if (host.dataset.toastToken !== toastToken) return;
          const latestToast = host.shadowRoot?.querySelector(".toast");
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
  const iconDetails = await getActionIconDetails(state, path);
  const shouldSetGlobalIcon = !tabId || (await isActiveTab(tabId));

  if (tabId) {
    await chrome.action.setIcon({ tabId, ...iconDetails }).catch(() => {});
  }
  if (shouldSetGlobalIcon) {
    await chrome.action.setIcon(iconDetails).catch(() => {});
  }
}

async function getActionIconDetails(state, path) {
  const imageData = await getActionIconImageData(state, path).catch(() => null);
  return imageData ? { imageData } : { path };
}

async function getActionIconImageData(state, path) {
  if (actionIconImageDataCache[state]) return actionIconImageDataCache[state];

  const entries = await Promise.all(
    Object.entries(path).map(async ([size, iconPath]) => {
      const response = await fetch(chrome.runtime.getURL(iconPath));
      if (!response.ok) throw new Error(`Icon fetch failed: ${iconPath}`);

      const bitmap = await createImageBitmap(await response.blob());
      const canvas = new OffscreenCanvas(Number(size), Number(size));
      const context = canvas.getContext("2d");
      if (!context) throw new Error(`Icon canvas unavailable: ${iconPath}`);

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return [size, context.getImageData(0, 0, canvas.width, canvas.height)];
    })
  );

  actionIconImageDataCache[state] = Object.fromEntries(entries);
  return actionIconImageDataCache[state];
}

async function updateActionIconForTab(tabId, urlValue) {
  if (!tabId) return;
  const url = urlValue || (await getTabUrl(tabId));
  const urlKeys = getSavedPageUrlKeysForUrl(url);
  if (urlKeys.length === 0) {
    await setActionIcon("idle", tabId);
    return;
  }

  const savedUrlKeys = await getSavedPageUrlKeys();
  if (urlKeys.some((urlKey) => savedUrlKeys.has(urlKey))) {
    await setActionIcon("active", tabId);
    return;
  }

  const isBookmarked = await isPageUrlBookmarked(url);
  const currentUrlKeys = getSavedPageUrlKeysForUrl(await getTabUrl(tabId));
  if (!urlKeys.some((urlKey) => currentUrlKeys.includes(urlKey))) return;

  if (isBookmarked) {
    await cacheSavedPageUrlKeys(urlKeys);
    await setActionIcon("active", tabId);
    return;
  }

  await setActionIcon("idle", tabId);
}

async function updateActiveTabActionIcon() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  if (activeTab?.id) await updateActionIconForTab(activeTab.id, activeTab.url || "");
}

async function markPageUrlSaved(url, tabId) {
  const urlKeys = getSavedPageUrlKeysForUrl(url);
  if (urlKeys.length === 0) return;

  await cacheSavedPageUrlKeys(urlKeys);
  await setActionIcon("active", tabId);
}

async function cacheSavedPageUrlKeys(urlKeys) {
  const nextUrlKeys = urlKeys.filter(Boolean);
  if (nextUrlKeys.length === 0) return;

  const savedUrlKeys = await getSavedPageUrlKeys();
  const nextSavedUrls = [
    ...nextUrlKeys,
    ...[...savedUrlKeys].filter((savedUrlKey) => !nextUrlKeys.includes(savedUrlKey)),
  ].slice(0, MAX_SAVED_PAGE_URLS);
  await chrome.storage.local.set({ [SAVED_PAGE_URLS_KEY]: nextSavedUrls });
}

async function isPageUrlBookmarked(url) {
  const settings = await getSettings();
  if (!settings.apiToken || !settings.workspaceSlug) return false;

  const urlKeys = getSavedPageUrlKeysForUrl(url);
  const lookupQueries = getBookmarkLookupQueries(url);

  const lookupResults = await Promise.all(
    lookupQueries.map(async (lookupQuery) => {
      const response = await fetch(
        `${settings.appUrl}/api/workspaces/${settings.workspaceSlug}/bookmarks/?query=${encodeURIComponent(lookupQuery)}`,
        {
          headers: authorizedHeaders(settings.apiToken),
        }
      ).catch(() => null);
      if (!response?.ok) return [];

      const data = await response.json().catch(() => null);
      return Array.isArray(data?.results) ? data.results : [];
    })
  );

  return lookupResults.flat().some((bookmark) => {
    const bookmarkUrlKeys = new Set([
      ...getSavedPageUrlKeysForUrl(bookmark?.url || ""),
      ...getSavedPageUrlKeysForUrl(bookmark?.metadata?.source_url || ""),
      ...getSavedPageUrlKeysForUrl(bookmark?.metadata?.og_url || ""),
    ]);
    return urlKeys.some((urlKey) => bookmarkUrlKeys.has(urlKey));
  });
}

async function getSavedPageUrlKeys() {
  const stored = await chrome.storage.local.get([SAVED_PAGE_URLS_KEY]);
  const savedUrls = Array.isArray(stored[SAVED_PAGE_URLS_KEY]) ? stored[SAVED_PAGE_URLS_KEY] : [];
  return new Set(savedUrls.filter(Boolean));
}

async function getTabUrl(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab?.url || "";
  } catch {
    return "";
  }
}

async function isActiveTab(tabId) {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return activeTab?.id === tabId;
  } catch {
    return false;
  }
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

function getSavedPageUrlKey(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return "";
  }
}

function getSavedPageUrlKeysForUrl(url) {
  const fullKey = getSavedPageUrlKey(url);
  if (!fullKey) return [];

  try {
    const parsed = new URL(fullKey);
    const keys = new Set([parsed.href]);

    const withoutSearch = new URL(parsed.href);
    withoutSearch.search = "";
    keys.add(withoutSearch.href);

    if (withoutSearch.pathname !== "/") {
      const withoutTrailingSlash = new URL(withoutSearch.href);
      withoutTrailingSlash.pathname = withoutTrailingSlash.pathname.replace(/\/+$/, "");
      keys.add(withoutTrailingSlash.href);

      const withTrailingSlash = new URL(withoutTrailingSlash.href);
      withTrailingSlash.pathname = `${withTrailingSlash.pathname}/`;
      keys.add(withTrailingSlash.href);
    }

    return [...keys].filter(Boolean);
  } catch {
    return [fullKey];
  }
}

function getBookmarkLookupQueries(url) {
  const urlKeys = getSavedPageUrlKeysForUrl(url);
  return [...new Set(urlKeys.map((urlKey) => urlKey.replace(/^https?:\/\//, "")).filter(Boolean))];
}

function isPermissionError(message) {
  const normalizedMessage = String(message || "").toLowerCase();
  return normalizedMessage.includes("403") || normalizedMessage.includes("required permissions");
}
