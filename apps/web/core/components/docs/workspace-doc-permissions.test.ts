import { describe, expect, it } from "vitest";
import { EUserPermissions } from "@plane/constants";
import {
  canDeleteOrphanWorkspaceDoc,
  getWorkspaceDocFavoritePresentation,
  resolveWorkspaceDocAdminProjectId,
} from "./workspace-doc-permissions";

const projectIds = ["project-a", "project-b"];
const joinedProjectIds = new Set(projectIds);

const resolve = (overrides: Partial<Parameters<typeof resolveWorkspaceDocAdminProjectId>[0]> = {}) =>
  resolveWorkspaceDocAdminProjectId({
    currentUserId: "current-user",
    getProjectRole: () => EUserPermissions.MEMBER,
    isProjectBrief: false,
    isWorkspaceAdmin: false,
    joinedProjectIds,
    ownerId: "another-user",
    pageProjectIds: projectIds,
    preferredProjectId: "project-a",
    ...overrides,
  });

describe("workspace Doc destructive-action permissions", () => {
  it("uses the safe linked project for the Doc owner", () => {
    expect(resolve({ ownerId: "current-user" })).toBe("project-a");
  });

  it("uses the safe linked project for a workspace admin", () => {
    expect(resolve({ isWorkspaceAdmin: true })).toBe("project-a");
  });

  it("uses a joined project where the user is a project admin", () => {
    expect(
      resolve({
        getProjectRole: (projectId) => (projectId === "project-b" ? EUserPermissions.ADMIN : EUserPermissions.MEMBER),
      })
    ).toBe("project-b");
  });

  it("protects briefs and Docs the user cannot administer", () => {
    expect(resolve()).toBeUndefined();
    expect(resolve({ isProjectBrief: true, isWorkspaceAdmin: true })).toBeUndefined();
  });
});

describe("orphaned workspace Doc deletion", () => {
  const canDeleteOrphan = (overrides: Partial<Parameters<typeof canDeleteOrphanWorkspaceDoc>[0]> = {}) =>
    canDeleteOrphanWorkspaceDoc({
      currentUserId: "current-user",
      hasAccessibleProject: false,
      isProjectBrief: false,
      isWorkspaceAdmin: false,
      ownerId: "another-user",
      ...overrides,
    });

  it("lets the owner delete a Doc whose projects were all deleted", () => {
    expect(canDeleteOrphan({ ownerId: "current-user" })).toBe(true);
  });

  it("lets a workspace admin delete someone else's orphaned Doc", () => {
    expect(canDeleteOrphan({ isWorkspaceAdmin: true })).toBe(true);
  });

  it("keeps project-linked Docs on the project-scoped delete", () => {
    expect(canDeleteOrphan({ ownerId: "current-user", hasAccessibleProject: true })).toBe(false);
  });

  it("still protects briefs and other users' Docs", () => {
    expect(canDeleteOrphan()).toBe(false);
    expect(canDeleteOrphan({ ownerId: "current-user", isProjectBrief: true })).toBe(false);
  });
});

describe("workspace Doc favorites", () => {
  it("keeps Docs and folders distinguishable in favorite metadata", () => {
    expect(getWorkspaceDocFavoritePresentation("doc")).toEqual({ label: "Doc", pageType: "doc" });
    expect(getWorkspaceDocFavoritePresentation("folder")).toEqual({ label: "Folder", pageType: "folder" });
  });

  it("defaults older pages without a type to Doc", () => {
    expect(getWorkspaceDocFavoritePresentation()).toEqual({ label: "Doc", pageType: "doc" });
  });
});
