import { EUserPermissions } from "@plane/constants";
import type { TPageType } from "@plane/types";

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
