/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { cn, getFileURL } from "@plane/utils";
// components
import { useDefaultWorkspaceLogo } from "./default-logos";

type Props = {
  logo: string | null | undefined;
  name: string | undefined;
  workspaceId?: string;
  classNames?: string;
};

export const WorkspaceLogo = observer(function WorkspaceLogo(props: Props) {
  // translation
  const { t } = useTranslation();
  // default logo (used when no custom logo has been uploaded)
  const seed = props.workspaceId ?? props.name ?? "";
  const defaultLogo = useDefaultWorkspaceLogo(seed);

  const hasCustomLogo = !!props.logo && props.logo !== "";
  const src = hasCustomLogo ? getFileURL(props.logo as string) : defaultLogo;

  return (
    <div className={cn("relative grid h-6 w-6 flex-shrink-0 place-items-center", props.classNames)}>
      <img
        src={src}
        className="absolute top-0 left-0 h-full w-full rounded-md object-cover"
        alt={t("aria_labels.projects_sidebar.workspace_logo")}
      />
    </div>
  );
});
