/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";

/** Dev-only preview wrapper — no auth, no workspace context. */
export default function PreviewLayout() {
  return <Outlet />;
}
