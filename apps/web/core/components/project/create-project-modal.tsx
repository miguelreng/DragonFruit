/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import useKeypress from "@/hooks/use-keypress";
import { CreateProjectForm } from "@/plane-web/components/projects/create/root";
import type { TProject } from "@/plane-web/types/projects";
import { ProjectFeatureUpdate } from "./project-feature-update";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  setToFavorite?: boolean;
  workspaceSlug: string;
  data?: Partial<TProject>;
  templateId?: string;
};

enum EProjectCreationSteps {
  CREATE_PROJECT = "CREATE_PROJECT",
  FEATURE_SELECTION = "FEATURE_SELECTION",
}

export function CreateProjectModal(props: Props) {
  const { isOpen, onClose, setToFavorite = false, workspaceSlug, data, templateId } = props;
  const [currentStep, setCurrentStep] = useState<EProjectCreationSteps>(EProjectCreationSteps.CREATE_PROJECT);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(EProjectCreationSteps.CREATE_PROJECT);
      setCreatedProjectId(null);
    }
  }, [isOpen]);

  const handleNextStep = (projectId: string) => {
    if (!projectId) return;
    setCreatedProjectId(projectId);
    setCurrentStep(EProjectCreationSteps.FEATURE_SELECTION);
  };

  useKeypress("Escape", () => {
    if (isOpen) onClose();
  });

  const isFeatureStep = currentStep === EProjectCreationSteps.FEATURE_SELECTION;

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={isFeatureStep ? EModalWidth.XXXXL : EModalWidth.XL}>
      {currentStep === EProjectCreationSteps.CREATE_PROJECT && (
        <CreateProjectForm
          setToFavorite={setToFavorite}
          workspaceSlug={workspaceSlug}
          onClose={onClose}
          handleNextStep={handleNextStep}
          data={data}
          templateId={templateId}
        />
      )}
      {currentStep === EProjectCreationSteps.FEATURE_SELECTION && (
        <ProjectFeatureUpdate projectId={createdProjectId} workspaceSlug={workspaceSlug} onClose={onClose} />
      )}
    </ModalCore>
  );
}
