// @ts-nocheck

// Logged on service-worker startup so you can confirm the running build in the
// extension's DevTools console. Keep in sync with manifest.json "version".
const EXTENSION_VERSION = "0.1.21";
console.log(`DragonFruit Bookmarks extension v${EXTENSION_VERSION}`);

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
    await saveWithFeedback(tab, {
      savingText: "Saving image to DragonFruit...",
      savedText: "Image saved to DragonFruit",
      save: () =>
        saveBookmark({
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
        }),
    });
    return;
  }

  const url = info.linkUrl || tab.url || "";
  if (!url) return;
  await saveWithFeedback(tab, {
    savingText: "Saving to DragonFruit...",
    savedText: "Saved to DragonFruit",
    save: () => saveUrlBookmark(url, tab),
  });
}

// Runs an action with the shared toast + error-recovery flow: auth gate, loading
// toast, then a success toast or a routed recovery (login / settings / error
// toast). `run` resolves with the action result; `successActionUrl(result)` may
// return a URL to attach to the success toast's "View" pill.
async function runWithFeedback(tab, { loadingText, successText, run, successActionUrl }) {
  const tabId = tab?.id;
  if (!tabId) return;
  try {
    const authState = await getAuthState(DEFAULT_API_URL);
    if (!authState.authenticated) {
      await openExtensionView("login", tabId);
      if (tab.url) await updateActionIconForTab(tabId, tab.url);
      return;
    }
    await showTabToast(tabId, loadingText, { state: "loading" });
    const result = await run();
    await showTabToast(tabId, successText, {
      state: "success",
      actionUrl: typeof successActionUrl === "function" ? successActionUrl(result) : "",
    });
  } catch (error) {
    const message = String(error?.message || "Something went wrong. Please try again.");
    if (isAuthenticationError(message)) {
      await openExtensionView("login", tabId);
    } else if (isConfigurationError(message)) {
      await openExtensionView("settings", tabId);
    } else if (isPermissionError(message)) {
      await showTabToast(tabId, "Error!", {
        state: "error",
        message: "No write access for the selected project. Choose another project.",
      });
    } else {
      await showTabToast(tabId, "Error!", { state: "error", message });
    }
    if (tab.url) await updateActionIconForTab(tabId, tab.url);
  }
}

// Used by the toolbar action and the context-menu entries so they stay consistent.
async function saveWithFeedback(tab, { savingText, savedText, save }) {
  await runWithFeedback(tab, {
    loadingText: savingText,
    successText: savedText,
    run: save,
    successActionUrl: bookmarkActionUrl,
  });
}

async function saveActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return { ok: false, error: "No active tab URL." };
  await saveUrlBookmark(tab.url, tab);
  return { ok: true };
}

async function handleActionClick(tab) {
  if (!tab?.id || !tab?.url) return;

  // Toggle: if this page already shows as saved, a second click removes it from
  // the workspace instead of saving a duplicate.
  if (await isPageUrlLocallySaved(tab.url)) {
    await setActionIcon("idle", tab.id);
    await runWithFeedback(tab, {
      loadingText: "Removing from DragonFruit...",
      successText: "Removed from DragonFruit",
      run: () => removeUrlBookmark(tab.url, tab),
    });
    return;
  }

  await setActionIcon("active", tab.id);
  await saveWithFeedback(tab, {
    savingText: "Saving to DragonFruit...",
    savedText: "Saved to DragonFruit",
    save: () => saveUrlBookmark(tab.url, tab),
  });
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
  if (pageMetadata.image_width && pageMetadata.image_height) {
    metadata.image_width = pageMetadata.image_width;
    metadata.image_height = pageMetadata.image_height;
  }
  if (pageMetadata.title) metadata.og_title = pageMetadata.title;
  if (pageMetadata.description) metadata.og_description = pageMetadata.description;
  if (pageMetadata.url) metadata.og_url = pageMetadata.url;

  const tags = isTweet ? ["tweet"] : [];

  if (isTweet && tab?.id && tab.url && sameUrl(tab.url, url)) {
    const screenshot = await captureTweetScreenshot(tab.id).catch(() => "");
    if (screenshot) {
      metadata.image_url = screenshot;
      metadata.screenshot_source = "chrome_extension";
      delete metadata.image_width;
      delete metadata.image_height;
    }
  }

  const savedBookmark = await saveBookmark({
    title: pageMetadata.title || tab?.title || titleFromUrl(url, "Saved bookmark"),
    url,
    description: pageMetadata.description || "",
    tags,
    metadata,
  });

  if (tab?.id && tab.url && getSavedPageUrlKey(tab.url) === getSavedPageUrlKey(url)) {
    await markPageUrlSaved(url, tab.id);
  }
  return savedBookmark;
}

// Removes every workspace bookmark that matches this URL, then clears the local
// saved-state cache and resets the toolbar icon. Returns the number removed.
async function removeUrlBookmark(url, tab) {
  const matches = await findSavedBookmarksForUrl(url);
  await Promise.all(matches.map((bookmark) => deleteBookmark(bookmark)));
  await removeSavedPageUrlKeys(getSavedPageUrlKeysForUrl(url));
  if (tab?.id) await setActionIcon("idle", tab.id);
  return matches.length;
}

function bookmarkActionUrl(bookmark) {
  const workspaceSlug = stringValue(bookmark?.workspace_slug);
  if (!workspaceSlug) return "";

  const projectId = stringValue(bookmark?.project_id);
  const workspacePath = encodeURIComponent(workspaceSlug);
  if (projectId) return `${DEFAULT_WEB_URL}/${workspacePath}/projects/${encodeURIComponent(projectId)}/bookmarks`;
  return `${DEFAULT_WEB_URL}/${workspacePath}/bookmarks`;
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
      const imageWidth = content('meta[property="og:image:width"]');
      const imageHeight = content('meta[property="og:image:height"]');
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
        image_width: imageWidth,
        image_height: imageHeight,
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
    image_width: positiveInt(value.image_width),
    image_height: positiveInt(value.image_height),
    favicon_url: stringValue(value.favicon_url),
    site_name: stringValue(value.site_name),
    url: stringValue(value.url),
  };
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

// The bookmark `title` column is CharField(max_length=255); trim to fit so a
// long page/og:title doesn't get rejected with a 400 by the API serializer.
const MAX_BOOKMARK_TITLE_LENGTH = 255;
function clampTitle(title) {
  const value = stringValue(title);
  return value.length > MAX_BOOKMARK_TITLE_LENGTH ? value.slice(0, MAX_BOOKMARK_TITLE_LENGTH) : value;
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
    title: clampTitle(payload.title),
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

async function deleteBookmark(bookmark) {
  const settings = await getSettings();
  if (!settings.apiToken) {
    throw new Error("Connect your DragonFruit account first.");
  }
  const workspaceSlug = stringValue(bookmark?.workspace_slug) || settings.workspaceSlug;
  const projectId = stringValue(bookmark?.project_id) || settings.projectId;
  const bookmarkId = stringValue(bookmark?.id);
  if (!workspaceSlug || !projectId || !bookmarkId) {
    throw new Error("Could not find the saved bookmark to remove.");
  }

  const response = await fetch(
    `${settings.appUrl}/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/${bookmarkId}/`,
    {
      method: "DELETE",
      headers: {
        ...authorizedHeaders(settings.apiToken),
        "X-DragonFruit-Source": "chrome-extension",
      },
    }
  ).catch(() => null);

  if (!response) throw new Error("Could not reach DragonFruit. Check your connection.");
  // 404 means it's already gone — treat removal as successful.
  if (response.status === 404) return;
  if (!response.ok) throw new Error(await bookmarkErrorMessage(response));
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
    // Prefer a wrapped {error|detail|message}, but fall back to the whole body
    // so DRF field-error dicts (e.g. {"title": ["Ensure this field has no more
    // than 255 characters."]}) surface instead of a bare status.
    const detail = data?.error || data?.detail || data?.message || data;
    const formatted = formatErrorDetail(detail);
    return formatted ? `${fallback} - ${formatted}` : fallback;
  }

  const text = await response.text().catch(() => "");
  return text ? `${fallback} - ${text.slice(0, 200)}` : fallback;
}

function formatErrorDetail(detail) {
  if (detail === null || detail === undefined) return "";
  if (typeof detail === "string") return detail.trim();
  if (Array.isArray(detail)) return detail.map(formatErrorDetail).filter(Boolean).join(", ");
  if (typeof detail === "object") {
    return Object.entries(detail)
      .map(([key, value]) => {
        const message = formatErrorDetail(value);
        if (!message) return "";
        // Keep field names on validation errors; drop generic wrapper keys.
        return /^(non_field_errors|detail|error|message)$/.test(key) ? message : `${key}: ${message}`;
      })
      .filter(Boolean)
      .join("; ");
  }
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

async function showTabToast(tabId, title, { message = "", state = "success", actionUrl = "" } = {}) {
  if (!tabId) return;
  try {
    const fontUrl = chrome.runtime.getURL("src/fonts/Figtree-Variable.ttf");
    // Register Figtree at the document level through the extension's own injected
    // stylesheet. A shadow-scoped @font-face is ignored by the browser, and a
    // page-context FontFace is often blocked by the site's font-src CSP — but
    // extension-injected CSS loads web_accessible_resources regardless of page CSP,
    // and document-level fonts are visible inside our shadow DOM.
    await chrome.scripting
      .insertCSS({
        target: { tabId },
        css: `@font-face{font-family:'Figtree';src:url('${fontUrl}') format('truetype');font-weight:300 800;font-style:normal;font-display:swap;}`,
      })
      .catch(() => {});
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [String(title || ""), String(message || ""), state, String(actionUrl || "")],
      func: (toastTitle, toastMessage, toastState, toastActionUrl) => {
        const TOAST_ID = "dragonfruit-extension-toast";
        if (!toastTitle) return;
        const normalizedState = toastState === "error" || toastState === "loading" ? toastState : "success";
        const hasAction = normalizedState === "success" && Boolean(toastActionUrl);
        const toastToken = String(Date.now());
        // Filled, type-colored "badge" glyphs that knock out white — matching the
        // shared action toast (packages/propel/src/toast/toast.tsx): BadgeCheck for
        // success, AlertCircle for error, the bar spinner for loading.
        const iconMarkup = {
          success: `
            <svg class="status-icon badge-icon" viewBox="0 0 24 24" fill="var(--success)" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"></path>
              <path d="m9 12 2 2 4-4" fill="none"></path>
            </svg>
          `,
          loading: `
            <svg class="status-icon spinner-icon" viewBox="0 0 24 24" aria-hidden="true">
              <g>
                <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.14"></rect>
                <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.29" transform="rotate(30 12 12)"></rect>
                <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.43" transform="rotate(60 12 12)"></rect>
                <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.57" transform="rotate(90 12 12)"></rect>
                <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.71" transform="rotate(120 12 12)"></rect>
                <rect width="2" height="5" x="11" y="1" fill="currentColor" opacity="0.86" transform="rotate(150 12 12)"></rect>
                <rect width="2" height="5" x="11" y="1" fill="currentColor" transform="rotate(180 12 12)"></rect>
                <animateTransform attributeName="transform" calcMode="discrete" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;30 12 12;60 12 12;90 12 12;120 12 12;150 12 12;180 12 12;210 12 12;240 12 12;270 12 12;300 12 12;330 12 12;360 12 12"></animateTransform>
              </g>
            </svg>
          `,
          error: `
            <svg class="status-icon badge-icon" viewBox="0 0 24 24" fill="var(--danger)" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" x2="12" y1="8" y2="12"></line>
              <line x1="12" x2="12.01" y1="16" y2="16"></line>
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
            :host {
              all: initial;
              /* Figtree is registered at the document level via insertCSS (see
                 showTabToast) so it resolves here; this makes it the default family
                 for every node in the toast. */
              font-family: 'Figtree', ui-sans-serif, system-ui, sans-serif;
              /* Action-toast tokens — mirror packages/tailwind-config/variables.css
                 and the shared toast in packages/propel/src/toast/toast.tsx (light). */
              --surface: oklch(1 0 0);
              --surface-2: oklch(0.9848 0.0003 230.66);
              --border-subtle-1: oklch(0.9235 0.001733 230.6853);
              --border-subtle: oklch(0.9389 0.0014 230.68);
              --text-primary: oklch(0.2378 0.0029 230.83);
              --text-secondary: oklch(0.4377 0.0066 230.87);
              --text-tertiary: oklch(0.5288 0.0083 230.88);
              --icon-tertiary: oklch(0.6161 0.009153 230.867);
              --icon-secondary: oklch(0.4377 0.0066 230.87);
              --success: oklch(0.632 0.185972 147.3695);
              --danger: oklch(0.583 0.238666 28.4765);
              --motion-fast-dur: 150ms;
              --motion-control-dur: 200ms;
              --motion-toast-dur: 500ms;
              --motion-standard-ease: cubic-bezier(0.22, 1, 0.36, 1);
              --motion-control-ease: ease-in-out;
              --shadow: 0px 10px 10px -10px #292f3d0a, 0px 30px 60px -12px #292f3d1a;
              position: fixed;
              right: 12px;
              top: 12px;
              z-index: 2147483647;
              width: min(360px, calc(100vw - 32px));
              color-scheme: light;
              pointer-events: none;
            }
            @media (prefers-color-scheme: dark) {
              :host {
                --surface: oklch(0.175 0.0045 30);
                --surface-2: oklch(0.205 0.005 30);
                --border-subtle-1: oklch(0.31 0.0065 30);
                --border-subtle: oklch(0.265 0.006 30);
                --text-primary: oklch(0.925 0.0035 30);
                --text-secondary: oklch(0.845 0.005 30);
                --text-tertiary: oklch(0.765 0.006 30);
                --icon-tertiary: oklch(0.68 0.007 30);
                --icon-secondary: oklch(0.845 0.005 30);
                --success: oklch(0.7914 0.2091 151.66);
                --danger: oklch(0.4446 0.1774 26.79);
                color-scheme: dark;
              }
            }
            .toast {
              position: relative;
              box-sizing: border-box;
              display: flex;
              width: 100%;
              height: 68px;
              align-items: center;
              gap: 12px;
              overflow: hidden;
              border: 1px solid var(--border-subtle-1);
              border-radius: 16px;
              background: var(--surface);
              padding: 14px 36px 14px 14px;
              box-shadow: var(--shadow);
              transform: translateY(-150%);
              opacity: 0;
              transition:
                opacity var(--motion-toast-dur) var(--motion-standard-ease),
                transform var(--motion-toast-dur) var(--motion-standard-ease);
              pointer-events: auto;
            }
            .toast[data-visible="true"] {
              opacity: 1;
              transform: translateY(0);
            }
            .status-icon {
              flex: 0 0 auto;
              width: 22px;
              height: 22px;
            }
            .spinner-icon {
              color: var(--text-tertiary);
            }
            .content {
              box-sizing: border-box;
              display: flex;
              min-width: 0;
              flex: 1 1 auto;
              flex-direction: column;
              gap: 2px;
            }
            .title {
              margin: 0;
              color: var(--text-primary);
              font: 600 14px/1.4 Figtree, ui-sans-serif, system-ui, sans-serif;
              letter-spacing: 0.14px;
            }
            .message {
              margin: 0;
              color: var(--text-tertiary);
              overflow: hidden;
              white-space: nowrap;
              text-overflow: ellipsis;
              max-width: 100%;
              font: 400 13px/1.4 Figtree, ui-sans-serif, system-ui, sans-serif;
              letter-spacing: 0.13px;
            }
            .close {
              position: absolute;
              top: 10px;
              right: 10px;
              display: grid;
              place-items: center;
              width: 18px;
              height: 18px;
              margin: 0;
              padding: 0;
              border: 0;
              background: transparent;
              color: var(--icon-tertiary);
              cursor: pointer;
              opacity: 0;
              transition:
                opacity var(--motion-control-dur) var(--motion-control-ease),
                color var(--motion-fast-dur) var(--motion-control-ease);
            }
            .toast:hover .close {
              opacity: 1;
            }
            .close:hover {
              color: var(--icon-secondary);
            }
            .close svg {
              width: 14px;
              height: 14px;
              stroke-width: 1.5;
            }
            .action {
              display: inline-flex;
              flex: 0 0 auto;
              align-items: center;
              margin: 0;
              padding: 4px 12px;
              border: 1px solid var(--border-subtle);
              border-radius: 999px;
              background: var(--surface-2);
              color: var(--text-secondary);
              cursor: pointer;
              font: 500 13px/1.4 Figtree, ui-sans-serif, system-ui, sans-serif;
              letter-spacing: 0.13px;
              transition:
                color var(--motion-fast-dur) var(--motion-control-ease),
                border-color var(--motion-fast-dur) var(--motion-control-ease);
            }
            .action:hover {
              border-color: var(--border-subtle-1);
              color: var(--text-primary);
            }
            @media (prefers-reduced-motion: reduce) {
              .toast { transition: opacity var(--motion-control-dur) var(--motion-control-ease); transform: none; }
              .toast[data-visible="true"] { transform: none; }
            }
          </style>
          <div class="toast" data-state="${normalizedState}" data-visible="false">
            ${iconMarkup}
            <div class="content">
              <p class="title"></p>
              ${toastMessage ? `<p class="message"></p>` : ""}
            </div>
            ${hasAction ? `<button class="action" type="button">View</button>` : ""}
            <button class="close" type="button" aria-label="Dismiss">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        `;

        const toast = root.querySelector(".toast");
        const titleElement = root.querySelector(".title");
        const messageElement = root.querySelector(".message");
        const actionButton = root.querySelector(".action");
        const closeButton = root.querySelector(".close");
        if (!toast || !titleElement) return;
        titleElement.textContent = toastTitle;
        if (messageElement) messageElement.textContent = toastMessage;

        actionButton?.addEventListener("click", () => {
          window.open(toastActionUrl, "_blank", "noopener,noreferrer");
          toast.dataset.visible = "false";
        });

        closeButton?.addEventListener("click", () => {
          toast.dataset.visible = "false";
        });

        requestAnimationFrame(() => {
          toast.dataset.visible = "true";
        });
        if (normalizedState === "loading") return;
        // Auto-dismiss after a few seconds — long enough to read the message and
        // click the "View" action pill. Mirrors the web app's toast timeout
        // (packages/propel/src/toast/toast.tsx).
        window.setTimeout(() => {
          if (host.dataset.toastToken !== toastToken) return;
          const latestToast = host.shadowRoot?.querySelector(".toast");
          if (!latestToast) return;
          latestToast.dataset.visible = "false";
        }, 4000);
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
      const context = canvas.getContext("2d", { willReadFrequently: true });
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

// Queries the workspace for bookmarks whose URL matches this page and returns the
// matching bookmark objects (de-duped by id). Each carries id/project_id needed
// to delete it. Returns [] when not signed in or nothing matches.
async function findSavedBookmarksForUrl(url) {
  const settings = await getSettings();
  if (!settings.apiToken || !settings.workspaceSlug) return [];

  const urlKeys = getSavedPageUrlKeysForUrl(url);
  if (urlKeys.length === 0) return [];
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

  const seenIds = new Set();
  return lookupResults.flat().filter((bookmark) => {
    const bookmarkUrlKeys = new Set([
      ...getSavedPageUrlKeysForUrl(bookmark?.url || ""),
      ...getSavedPageUrlKeysForUrl(bookmark?.metadata?.source_url || ""),
      ...getSavedPageUrlKeysForUrl(bookmark?.metadata?.og_url || ""),
    ]);
    if (!urlKeys.some((urlKey) => bookmarkUrlKeys.has(urlKey))) return false;
    const id = stringValue(bookmark?.id);
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
}

async function isPageUrlBookmarked(url) {
  return (await findSavedBookmarksForUrl(url)).length > 0;
}

// Fast, local-only check used to decide save-vs-remove on click. Mirrors the
// cache that drives the toolbar icon, so the toggle matches what the user sees.
async function isPageUrlLocallySaved(url) {
  const urlKeys = getSavedPageUrlKeysForUrl(url);
  if (urlKeys.length === 0) return false;
  const savedUrlKeys = await getSavedPageUrlKeys();
  return urlKeys.some((urlKey) => savedUrlKeys.has(urlKey));
}

async function getSavedPageUrlKeys() {
  const stored = await chrome.storage.local.get([SAVED_PAGE_URLS_KEY]);
  const savedUrls = Array.isArray(stored[SAVED_PAGE_URLS_KEY]) ? stored[SAVED_PAGE_URLS_KEY] : [];
  return new Set(savedUrls.filter(Boolean));
}

async function removeSavedPageUrlKeys(urlKeys) {
  const keysToRemove = new Set((urlKeys || []).filter(Boolean));
  if (keysToRemove.size === 0) return;
  const savedUrlKeys = await getSavedPageUrlKeys();
  const next = [...savedUrlKeys].filter((urlKey) => !keysToRemove.has(urlKey));
  await chrome.storage.local.set({ [SAVED_PAGE_URLS_KEY]: next });
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
