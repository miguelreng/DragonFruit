// @ts-nocheck

const DEFAULT_APP_URL = "http://localhost:3000";

const appUrlInput = document.querySelector("#app-url");
const workspaceInput = document.querySelector("#workspace-slug");
const projectSelect = document.querySelector("#project-id");
const authActionButton = document.querySelector("#auth-action");
const loadProjectsButton = document.querySelector("#load-projects");
const savePageButton = document.querySelector("#save-page");
const statusEl = document.querySelector("#status");

let isAuthenticated = false;

init();

async function init() {
  const stored = await chrome.storage.sync.get(["appUrl", "workspaceSlug", "projectId", "projects"]);
  appUrlInput.value = stored.appUrl || DEFAULT_APP_URL;
  workspaceInput.value = stored.workspaceSlug || "";
  renderProjects(stored.projects || [], stored.projectId || "");
  authActionButton.addEventListener("click", toggleAuth);
  loadProjectsButton.addEventListener("click", loadProjects);
  savePageButton.addEventListener("click", saveActivePage);
  appUrlInput.addEventListener("change", persistSettings);
  workspaceInput.addEventListener("change", persistSettings);
  projectSelect.addEventListener("change", persistSettings);
  await refreshAuthState();
  setStatus(
    isAuthenticated ? (projectSelect.value ? "Ready" : "Choose project") : "Connect account",
    isAuthenticated ? "success" : ""
  );
}

async function refreshAuthState() {
  chrome.runtime.sendMessage({ type: "GET_AUTH_STATE", appUrl: normalizeAppUrl(appUrlInput.value) }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message || "Could not check account", "error");
      return;
    }
    isAuthenticated = Boolean(response?.authenticated);
    const label = response?.user?.display_name || response?.user?.email || "Connected";
    authActionButton.textContent = isAuthenticated ? label : "Connect";
    authActionButton.dataset.connected = String(isAuthenticated);
    setStatus(isAuthenticated ? "Connected" : "Connect account", isAuthenticated ? "success" : "");
  });
}

async function toggleAuth() {
  authActionButton.disabled = true;
  await persistSettings();
  if (isAuthenticated) {
    chrome.runtime.sendMessage({ type: "SIGN_OUT" }, (response) => {
      if (chrome.runtime.lastError) {
        authActionButton.disabled = false;
        setStatus(chrome.runtime.lastError.message || "Could not sign out", "error");
        return;
      }
      isAuthenticated = false;
      authActionButton.disabled = false;
      authActionButton.textContent = "Connect";
      authActionButton.dataset.connected = "false";
      renderProjects([], "");
      setStatus(response?.ok ? "Signed out" : "Could not sign out", response?.ok ? "" : "error");
    });
    return;
  }

  setStatus("Opening sign in...", "loading");
  chrome.runtime.sendMessage({ type: "SIGN_IN", appUrl: normalizeAppUrl(appUrlInput.value) }, (response) => {
    authActionButton.disabled = false;
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message || "Could not connect", "error");
      return;
    }
    if (!response?.ok) {
      setStatus(response?.error || "Could not connect", "error");
      return;
    }
    isAuthenticated = true;
    const label = response?.user?.display_name || response?.user?.email || "Connected";
    authActionButton.textContent = label;
    authActionButton.dataset.connected = "true";
    setStatus("Connected", "success");
  });
}

async function loadProjects() {
  await persistSettings();
  setStatus("Loading...", "loading");
  loadProjectsButton.disabled = true;
  const appUrl = normalizeAppUrl(appUrlInput.value);
  const workspaceSlug = workspaceInput.value.trim();
  chrome.runtime.sendMessage({ type: "LOAD_PROJECTS", appUrl, workspaceSlug }, async (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message || "Could not load projects", "error");
      loadProjectsButton.disabled = false;
      return;
    }
    if (!response?.ok) {
      setStatus(response?.error || "Could not load projects", "error");
      loadProjectsButton.disabled = false;
      return;
    }
    const data = response.data || {};
    renderProjects(data.projects || [], data.default_project_id || "");
    await persistSettings();
    setStatus("Ready", "success");
    loadProjectsButton.disabled = false;
  });
}

async function saveActivePage() {
  await persistSettings();
  setStatus("Saving...", "loading");
  savePageButton.disabled = true;
  chrome.runtime.sendMessage({ type: "SAVE_ACTIVE_TAB" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message || "Could not save", "error");
      savePageButton.disabled = false;
      return;
    }
    const ok = Boolean(response?.ok);
    setStatus(ok ? "Saved" : response?.error || "Could not save", ok ? "success" : "error");
    savePageButton.disabled = false;
  });
}

async function persistSettings() {
  const projects = Array.from(projectSelect.options).map((option) => ({
    id: option.value,
    name: option.textContent || option.value,
  }));
  await chrome.storage.sync.set({
    appUrl: normalizeAppUrl(appUrlInput.value),
    workspaceSlug: workspaceInput.value.trim(),
    projectId: projectSelect.value,
    projects,
  });
}

function renderProjects(projects, selectedProjectId) {
  projectSelect.innerHTML = "";
  if (projects.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Load writable projects";
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

function setStatus(text, state = "") {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function normalizeAppUrl(value) {
  return String(value || DEFAULT_APP_URL).replace(/\/+$/, "");
}
