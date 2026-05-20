/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Service = "notion" | "clickup";

type Props = {
  service: Service;
  isOpen: boolean;
  onClose: () => void;
};

export function ConnectInfoModal({ service, isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const label = service === "notion" ? "Notion" : "ClickUp";
  const stepKeys =
    service === "notion"
      ? [
          "workspace_settings.settings.imports.connect_modal.steps_notion_1",
          "workspace_settings.settings.imports.connect_modal.steps_notion_2",
          "workspace_settings.settings.imports.connect_modal.steps_notion_3",
        ]
      : [
          "workspace_settings.settings.imports.connect_modal.steps_clickup_1",
          "workspace_settings.settings.imports.connect_modal.steps_clickup_2",
          "workspace_settings.settings.imports.connect_modal.steps_clickup_3",
        ];

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex flex-col">
        <div className="border-b-[0.5px] border-subtle px-5 py-4">
          <h3 className="text-18 font-medium text-secondary">
            {t("workspace_settings.settings.imports.connect_modal.title", { service: label })}
          </h3>
          <p className="mt-1 text-13 text-tertiary">
            {t("workspace_settings.settings.imports.connect_modal.intro", { service: label })}
          </p>
        </div>
        <div className="px-5 py-4">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-13 text-secondary">
            {stepKeys.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ol>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="primary" size="lg" type="button" onClick={onClose}>
            {t("workspace_settings.settings.imports.connect_modal.got_it")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
