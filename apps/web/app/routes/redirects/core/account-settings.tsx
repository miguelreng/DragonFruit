/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/account-settings";

export const clientLoader = ({ params }: Route.ClientLoaderArgs) => {
  throw redirect(`/${params.workspaceSlug}/settings/account/general/`);
};

export default function AccountSettings() {
  return null;
}
