/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";

type TGlobalModalsProps = {
  workspaceSlug: string;
};

/**
 * GlobalModals component manages workspace-level modals across DragonFruit
 * applications. Profile/account settings are now a section of the unified
 * settings page (no longer a modal), so there are currently no global modals.
 */
export const GlobalModals = observer(function GlobalModals(_props: TGlobalModalsProps) {
  return null;
});
