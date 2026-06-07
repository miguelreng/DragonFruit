/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import useKeypress from "@/hooks/use-keypress";
import { CreateProjectForm } from "@/plane-web/components/projects/create/root";
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  setToFavorite?: boolean;
  workspaceSlug: string;
  data?: Partial<TProject>;
  templateId?: string;
};

export function CreateProjectModal(props: Props) {
  const { isOpen, onClose, setToFavorite = false, workspaceSlug, data, templateId } = props;

  // Projects are created with a sensible default feature set (Brief, Tasks,
  // Docs) so there's no separate feature-selection step — creating the
  // project simply closes the modal.
  const handleNextStep = (projectId: string) => {
    if (!projectId) return;
    onClose();
  };

  useKeypress("Escape", () => {
    if (isOpen) onClose();
  });

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <CreateProjectForm
        setToFavorite={setToFavorite}
        workspaceSlug={workspaceSlug}
        onClose={onClose}
        handleNextStep={handleNextStep}
        data={data}
        templateId={templateId}
      />
    </ModalCore>
  );
}
