// @ts-nocheck

const DEFAULT_APP_URL = "http://localhost:3000";

const appUrlInput = document.querySelector("#app-url");
const workspaceInput = document.querySelector("#workspace-slug");
const projectSelect = document.querySelector("#project-id");
const loadProjectsButton = document.querySelector("#load-projects");
const savePageButton = document.querySelector("#save-page");
const statusEl = document.querySelector("#status");

init();

async function init() {
  const stored = await chrome.storage.sync.get(["appUrl", "workspaceSlug", "projectId", "projects"]);
  appUrlInput.value = stored.appUrl || DEFAULT_APP_URL;
  workspaceInput.value = stored.workspaceSlug || "";
  renderProjects(stored.projects || [], stored.projectId || "");
  loadProjectsButton.addEventListener("click", loadProjects);
  savePageButton.addEventListener("click", saveActivePage);
  appUrlInput.addEventListener("change", persistSettings);
  workspaceInput.addEventListener("change", persistSettings);
  projectSelect.addEventListener("change", persistSettings);
  setStatus(projectSelect.value ? "Ready" : "Not configured", projectSelect.value ? "success" : "");
}

async function loadProjects() {
  await persistSettings();
  setStatus("Loading...", "loading");
  loadProjectsButton.disabled = true;
  const appUrl = normalizeAppUrl(appUrlInput.value);
  const workspaceSlug = workspaceInput.value.trim();
  try {
    const response = await fetch(`${appUrl}/api/workspaces/${workspaceSlug}/bookmark-extension/context/`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    renderProjects(data.projects || [], data.default_project_id || "");
    await persistSettings();
    setStatus("Ready", "success");
  } catch {
    setStatus("Sign in first", "error");
  } finally {
    loadProjectsButton.disabled = false;
  }
}

async function saveActivePage() {
  await persistSettings();
  setStatus("Saving...", "loading");
  savePageButton.disabled = true;
  chrome.runtime.sendMessage({ type: "SAVE_ACTIVE_TAB" }, (response) => {
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
