/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";

type Props = {
  handleClose: () => void;
  isClosable?: boolean;
};

function ProjectCreateHeader(props: Props) {
  const { handleClose, isClosable = true } = props;
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
      <div>
        <h3 className="text-h6-medium text-primary">{t("create_a_project")}</h3>
        <p className="mt-1 text-caption-md-regular text-secondary">{t("create_a_project_description")}</p>
      </div>
      {isClosable && (
        <button type="button" onClick={handleClose} className="rounded p-1 hover:bg-layer-2">
          <CloseIcon className="h-4 w-4 text-secondary" />
        </button>
      )}
    </div>
  );
}

export default ProjectCreateHeader;
