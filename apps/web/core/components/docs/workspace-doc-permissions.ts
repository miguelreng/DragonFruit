import { EUserPermissions } from "@dragonfruit/constants";
import type { TPageType } from "@dragonfruit/types";

export const getWorkspaceDocFavoritePresentation = (pageType?: TPageType) => {
  const resolvedPageType = pageType ?? "doc";
  return {
    label: resolvedPageType === "folder" ? "Folder" : "Doc",
    pageType: resolvedPageType,
  };
};

type ResolveWorkspaceDocAdminProjectIdParams = {
  currentUserId?: string;
  getProjectRole: (projectId: string) => EUserPermissions | undefined;
  isProjectBrief: boolean;
  isWorkspaceAdmin: boolean;
  joinedProjectIds: ReadonlySet<string>;
  ownerId?: string;
  pageProjectIds: string[];
  preferredProjectId?: string;
};

type CanDeleteOrphanWorkspaceDocParams = {
  currentUserId?: string;
  hasAccessibleProject: boolean;
  isProjectBrief: boolean;
  isWorkspaceAdmin: boolean;
  ownerId?: string;
};

/**
 * A doc whose every linked project was deleted has no project route left for
 * the regular destroy, so the owner (or a workspace admin) deletes it through
 * the workspace-level endpoint instead. The API re-checks that no live project
 * link remains, so a stale `hasAccessibleProject` can't over-delete.
 */
export const canDeleteOrphanWorkspaceDoc = ({
  currentUserId,
  hasAccessibleProject,
  isProjectBrief,
  isWorkspaceAdmin,
  ownerId,
}: CanDeleteOrphanWorkspaceDocParams) => {
  if (isProjectBrief || hasAccessibleProject) return false;
  return isWorkspaceAdmin || (Boolean(currentUserId) && ownerId === currentUserId);
};

export const resolveWorkspaceDocAdminProjectId = ({
  currentUserId,
  getProjectRole,
  isProjectBrief,
  isWorkspaceAdmin,
  joinedProjectIds,
  ownerId,
  pageProjectIds,
  preferredProjectId,
}: ResolveWorkspaceDocAdminProjectIdParams) => {
  if (isProjectBrief || !preferredProjectId) return undefined;
  if (currentUserId && ownerId === currentUserId) return preferredProjectId;
  if (isWorkspaceAdmin) return preferredProjectId;
  return pageProjectIds.find(
    (projectId) => joinedProjectIds.has(projectId) && getProjectRole(projectId) === EUserPermissions.ADMIN
  );
};
