/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RouteConfig } from "@react-router/dev/routes";
import { index, layout, route } from "@react-router/dev/routes";

export default [
  index("./page.tsx"),
  route("spaces", "./aliases/spaces-index.ts"),
  route("native-login", "./native-login/page.tsx"),
  route("spaces/native-login", "./aliases/spaces-native-login.ts"),
  route(":workspaceSlug/:projectId", "./[workspaceSlug]/[projectId]/page.tsx"),
  route("spaces/:workspaceSlug/:projectId", "./aliases/spaces-project.ts"),
  layout("./issues/[anchor]/layout.tsx", [
    route("issues/:anchor", "./issues/[anchor]/page.tsx"),
    // Matches /spaces/issues/:anchor on the Space deployment and the
    // /:workspace/calendar/:anchor or /:workspace/project/:anchor canonical
    // URLs kept visible after the public gateway rewrite.
    route(":workspaceIdentifier/:contentType/:anchor", "./aliases/public-content.ts"),
  ]),
  // Catch-all route for 404 handling
  route("*", "./not-found.tsx"),
] satisfies RouteConfig;
