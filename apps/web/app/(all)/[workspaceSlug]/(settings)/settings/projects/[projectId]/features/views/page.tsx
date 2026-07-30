/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/page";

export function clientLoader({ params }: Route.ClientLoaderArgs) {
  throw redirect(`/${params.workspaceSlug}/settings/projects/${params.projectId}`);
}

export default function LegacyViewsSettingsRedirect() {
  return null;
}
