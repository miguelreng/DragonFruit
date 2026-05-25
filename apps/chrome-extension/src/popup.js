// @ts-nocheck

const DEFAULT_API_URL = "https://api.dragonfruit.sh";

const loginView = document.querySelector("#login-view");
const bookmarkView = document.querySelector("#bookmark-view");
const settingsView = document.querySelector("#settings-view");
const accountLabel = document.querySelector("#account-label");
const workspaceSelect = document.querySelector("#workspace-slug");
const projectSelect = document.querySelector("#project-id");
const authActionButton = document.querySelector("#auth-action");
const signOutButton = document.querySelector("#sign-out");
const refreshSettingsButton = document.querySelector("#refresh-settings");
const savePageButton = document.querySelector("#save-page");
const statusEl = document.querySelector("#status");

let isAuthenticated = false;
let authPollTimer = null;
let currentUser = null;

init();

async function init() {
  savePageButton.addEventListener("click", saveActivePage);
  authActionButton.addEventListener("click", toggleAuth);
  signOutButton.addEventListener("click", toggleAuth);
  refreshSettingsButton.addEventListener("click", refreshBookmarkContext);
  workspaceSelect.addEventListener("change", handleWorkspaceChange);
  projectSelect.addEventListener("change", persistSettings);

  const popupView = await takePopupView();
  await refreshAuthState({ preferredView: popupView });
}

async function takePopupView() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "settings") return "settings";
  const data = await chrome.storage.session?.get(["popupView"]);
  await chrome.storage.session?.remove(["popupView"]);
  return data?.popupView === "settings" ? "settings" : "bookmark";
}

async function refreshAuthState({ preferredView = "bookmark" } = {}) {
  chrome.runtime.sendMessage({ type: "GET_AUTH_STATE", appUrl: DEFAULT_API_URL }, async (response) => {
    if (chrome.runtime.lastError) {
      showLogin();
      setStatus(chrome.runtime.lastError.message || "Could not check account", "error");
      return;
    }

    isAuthenticated = Boolean(response?.authenticated);
    currentUser = response?.user || null;

    if (response?.pending) {
      showLogin();
      setStatus("Finish sign in on the DragonFruit page", "loading");
      startAuthPolling();
      return;
    }

    if (isStaleAuthorizationPageError(response?.error) && !isAuthenticated) {
      await chrome.storage.sync.set({ authStatus: "", authError: "" });
      showLogin();
      setStatus("Connect account", "");
      stopAuthPolling();
      return;
    }

    if (response?.error && !isAuthenticated) {
      showLogin();
      setStatus(response.error, "error");
      stopAuthPolling();
      return;
    }

    if (!isAuthenticated) {
      showLogin();
      setStatus("Connect account", "");
      stopAuthPolling();
      return;
    }

    stopAuthPolling();
    await ensureBookmarkContext();
    updateAccountLabel();
    if (response?.warning) setStatus(response.warning, "");
    if (preferredView === "settings") showSettings();
    else showBookmark();
  });
}

async function toggleAuth() {
  authActionButton.disabled = true;
  signOutButton.disabled = true;
  if (isAuthenticated) {
    chrome.runtime.sendMessage({ type: "SIGN_OUT" }, (response) => {
      authActionButton.disabled = false;
      signOutButton.disabled = false;
      isAuthenticated = false;
      currentUser = null;
      renderWorkspaces([], "");
      renderProjects([], "");
      showLogin();
      setStatus(response?.ok ? "Signed out" : "Could not sign out", response?.ok ? "" : "error");
    });
    return;
  }

  setStatus("Opening DragonFruit login...", "loading");
  chrome.runtime.sendMessage({ type: "SIGN_IN", appUrl: DEFAULT_API_URL }, (response) => {
    authActionButton.disabled = false;
    signOutButton.disabled = false;
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message || "Could not connect", "error");
      return;
    }
    if (!response?.ok) {
      setStatus(response?.error || "Could not connect", "error");
      return;
    }
    setStatus("Finish sign in on the DragonFruit page", "loading");
    startAuthPolling();
  });
}

function startAuthPolling() {
  if (authPollTimer) return;
  authPollTimer = setInterval(pollPendingSignIn, 1200);
}

function stopAuthPolling() {
  if (!authPollTimer) return;
  clearInterval(authPollTimer);
  authPollTimer = null;
}

async function pollPendingSignIn() {
  chrome.runtime.sendMessage({ type: "COMPLETE_PENDING_SIGN_IN", appUrl: DEFAULT_API_URL }, async (response) => {
    if (chrome.runtime.lastError) {
      await refreshAuthState();
      return;
    }
    if (response?.ok) {
      await refreshAuthState();
      return;
    }
    if (!response?.pending && response?.error) {
      setStatus(response.error, "error");
    }
  });
}

async function ensureBookmarkContext() {
  const stored = await chrome.storage.sync.get(["workspaceSlug", "projectId", "workspaces", "projects"]);
  renderWorkspaces(stored.workspaces || [], stored.workspaceSlug || "");
  renderProjects(stored.projects || [], stored.projectId || "");
  if (stored.workspaceSlug && stored.projectId) {
    setStatus("Ready", "success");
    return;
  }
  await refreshBookmarkContext();
}

async function refreshBookmarkContext() {
  setStatus("Loading workspace...", "loading");
  refreshSettingsButton.disabled = true;
  try {
    const workspaceSlug = await ensureWorkspace();
    if (!workspaceSlug) {
      setStatus("No workspace found", "error");
      return;
    }
    await loadProjectsForWorkspace(workspaceSlug);
    setStatus(projectSelect.value ? "Ready" : "Choose a writable project", projectSelect.value ? "success" : "");
  } finally {
    refreshSettingsButton.disabled = false;
  }
}

async function ensureWorkspace() {
  const stored = await chrome.storage.sync.get(["workspaceSlug"]);
  if (stored.workspaceSlug) return stored.workspaceSlug;

  const response = await fetch(`${DEFAULT_API_URL}/api/users/me/workspaces/?fields=id,name,slug`, {
    headers: await authHeaders(),
  });
  if (!response.ok) {
    setStatus(`Could not load workspaces: ${response.status}`, "error");
    return "";
  }

  const workspaces = await response.json();
  const selectedWorkspaceSlug = workspaces[0]?.slug || "";
  renderWorkspaces(workspaces, selectedWorkspaceSlug);
  await chrome.storage.sync.set({ workspaces, workspaceSlug: selectedWorkspaceSlug });
  return selectedWorkspaceSlug;
}

async function handleWorkspaceChange() {
  await chrome.storage.sync.set({ workspaceSlug: workspaceSelect.value, projectId: "", projects: [] });
  await loadProjectsForWorkspace(workspaceSelect.value);
}

async function loadProjectsForWorkspace(workspaceSlug) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "LOAD_PROJECTS", appUrl: DEFAULT_API_URL, workspaceSlug }, async (response) => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "Could not load projects", "error");
        resolve(false);
        return;
      }
      if (!response?.ok) {
        setStatus(response?.error || "Could not load projects", "error");
        resolve(false);
        return;
      }
      const data = response.data || {};
      const projects = data.projects || [];
      renderProjects(projects, data.default_project_id || "");
      await persistSettings();
      setStatus(projects.length ? "Ready" : "No writable projects", projects.length ? "success" : "error");
      resolve(true);
    });
  });
}

async function saveActivePage() {
  setStatus("Saving...", "loading");
  savePageButton.disabled = true;
  chrome.runtime.sendMessage({ type: "SAVE_ACTIVE_TAB" }, async (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message || "Could not save", "error");
      savePageButton.disabled = false;
      return;
    }
    if (!response?.ok && String(response?.error || "").includes("Choose a workspace")) {
      await refreshBookmarkContext();
    }
    const ok = Boolean(response?.ok);
    setStatus(ok ? "Saved" : response?.error || "Could not save", ok ? "success" : "error");
    savePageButton.disabled = false;
  });
}

async function persistSettings() {
  const workspaces = Array.from(workspaceSelect.options).map((option) => ({
    slug: option.value,
    name: option.textContent || option.value,
  }));
  const projects = Array.from(projectSelect.options).map((option) => ({
    id: option.value,
    name: option.textContent || option.value,
  }));
  await chrome.storage.sync.set({
    appUrl: DEFAULT_API_URL,
    workspaceSlug: workspaceSelect.value,
    projectId: projectSelect.value,
    workspaces,
    projects,
  });
}

function renderWorkspaces(workspaces, selectedWorkspaceSlug) {
  workspaceSelect.innerHTML = "";
  if (workspaces.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No workspace";
    workspaceSelect.append(option);
    return;
  }
  for (const workspace of workspaces) {
    const option = document.createElement("option");
    option.value = workspace.slug;
    option.textContent = workspace.name || workspace.slug;
    workspaceSelect.append(option);
  }
  workspaceSelect.value = selectedWorkspaceSlug || workspaces[0].slug;
}

function renderProjects(projects, selectedProjectId) {
  projectSelect.innerHTML = "";
  if (projects.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No writable project";
    projectSelect.append(option);
    return;
  }
  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.identifier ? `${project.identifier} - ${project.name}` : project.name;
    projectSelect.append(option);
  }
  projectSelect.value = selectedProjectId || projects[0].id;
}

async function authHeaders() {
  const { apiToken } = await chrome.storage.sync.get(["apiToken"]);
  return apiToken ? { "X-Api-Key": apiToken } : {};
}

function updateAccountLabel() {
  accountLabel.textContent = currentUser?.display_name || currentUser?.email || "Connected";
}

function showLogin() {
  loginView.hidden = false;
  bookmarkView.hidden = true;
  settingsView.hidden = true;
  authActionButton.textContent = "Continue with DragonFruit";
  authActionButton.dataset.connected = "false";
}

function showBookmark() {
  loginView.hidden = true;
  bookmarkView.hidden = false;
  settingsView.hidden = true;
  setStatus(projectSelect.value ? "Ready" : "Choose a writable project", projectSelect.value ? "success" : "");
}

function showSettings() {
  loginView.hidden = true;
  bookmarkView.hidden = true;
  settingsView.hidden = false;
  authActionButton.textContent = "Log out";
  authActionButton.dataset.connected = "true";
  setStatus(projectSelect.value ? "Ready" : "Choose a writable project", projectSelect.value ? "success" : "");
}

function setStatus(text, state = "") {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function isStaleAuthorizationPageError(error) {
  return String(error || "")
    .toLowerCase()
    .includes("authorization page could not be loaded");
}
