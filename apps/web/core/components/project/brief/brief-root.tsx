/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { EditorRefApi } from "@plane/editor";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSearchEntityRequestPayload } from "@plane/types";
import { EFileAssetType } from "@plane/types";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import { RichTextEditor } from "@/components/editor/rich-text";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

type TProjectBriefRootProps = {
  workspaceSlug: string;
  projectId: string;
};

// debounce window for autosaving the brief while the user types
const AUTOSAVE_DELAY = 1500;

export const ProjectBriefRoot = observer(function ProjectBriefRoot(props: TProjectBriefRootProps) {
  const { workspaceSlug, projectId } = props;
  // store hooks
  const { getProjectById, fetchProjectDetails, updateProject } = useProject();
  const { getWorkspaceBySlug } = useWorkspace();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { allowPermissions } = useUserPermissions();
  // refs
  const editorRef = useRef<EditorRefApi | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // derived values
  const project = getProjectById(projectId);
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const canEdit = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  // ensure full project details (incl. description_html) are loaded
  const { isLoading } = useSWR(
    workspaceSlug && projectId ? `PROJECT_BRIEF_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchProjectDetails(workspaceSlug, projectId) : null,
    { revalidateOnFocus: false }
  );
  // entity search handler for @mentions
  const searchMentionCallback = useCallback(
    async (payload: TSearchEntityRequestPayload) =>
      await workspaceService.searchEntity(workspaceSlug, { ...payload, project_id: projectId }),
    [workspaceSlug, projectId]
  );
  // persist the brief
  const handleSave = useCallback(
    async (descriptionJSON: object, descriptionHTML: string) => {
      try {
        await updateProject(workspaceSlug, projectId, {
          description_html: descriptionHTML,
          description_text: descriptionJSON,
        });
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "Failed to save the project brief. Please try again.",
        });
      }
    },
    [updateProject, workspaceSlug, projectId]
  );
  // debounced autosave on editor change
  const handleChange = useCallback(
    (descriptionJSON: object, descriptionHTML: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        void handleSave(descriptionJSON, descriptionHTML);
      }, AUTOSAVE_DELAY);
    },
    [handleSave]
  );
  // editor asset handlers
  const uploadFile = useCallback(
    async (blockId: string, file: File) => {
      const { asset_id } = await uploadEditorAsset({
        blockId,
        data: { entity_identifier: projectId, entity_type: EFileAssetType.PROJECT_DESCRIPTION },
        file,
        projectId,
        workspaceSlug,
      });
      return asset_id;
    },
    [uploadEditorAsset, projectId, workspaceSlug]
  );
  const duplicateFile = useCallback(
    async (assetId: string) => {
      const { asset_id } = await duplicateEditorAsset({
        assetId,
        entityId: projectId,
        entityType: EFileAssetType.PROJECT_DESCRIPTION,
        projectId,
        workspaceSlug,
      });
      return asset_id;
    },
    [duplicateEditorAsset, projectId, workspaceSlug]
  );

  const initialValue = useMemo(() => project?.description_html ?? "<p></p>", [project?.description_html]);

  if (!project || isLoading)
    return (
      <div className="grid size-full place-items-center">
        <LogoSpinner />
      </div>
    );

  return (
    <div className="vertical-scrollbar scrollbar-md size-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-10 md:px-8">
        <h1 className="text-26 px-3 font-semibold break-words text-primary">{project.name}</h1>
        {canEdit ? (
          <RichTextEditor
            editable
            ref={editorRef}
            id="project-brief-editor"
            initialValue={initialValue}
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            onChange={handleChange}
            searchMentionCallback={searchMentionCallback}
            uploadFile={uploadFile}
            duplicateFile={duplicateFile}
            placeholder="Write an overview of this project…"
            containerClassName="min-h-[50vh]"
          />
        ) : (
          <RichTextEditor
            editable={false}
            ref={editorRef}
            id="project-brief-editor"
            initialValue={initialValue}
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            containerClassName="min-h-[50vh]"
          />
        )}
      </div>
    </div>
  );
});
