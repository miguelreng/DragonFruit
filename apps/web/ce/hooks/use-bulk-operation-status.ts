/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Upstream Plane gates bulk select behind a paid tier — the CE build returns
// `false` so the row checkboxes never render and the floating bulk-action
// bar never appears. DragonFruit is open-source and free, so the gate is
// removed and bulk operations are always on.
export const useBulkOperationStatus = () => true;
