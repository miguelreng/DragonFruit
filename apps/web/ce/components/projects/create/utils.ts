/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { RANDOM_EMOJI_CODES } from "@plane/constants";
import type { IProject } from "@plane/types";

export const getProjectFormValues = (): Partial<IProject> => ({
  description: "",
  logo_props: {
    in_use: "emoji",
    emoji: {
      value: RANDOM_EMOJI_CODES[Math.floor(Math.random() * RANDOM_EMOJI_CODES.length)],
    },
  },
  identifier: "",
  name: "",
  network: 2,
  project_lead: null,
  // Default feature set: Brief + Tasks (always-on in the UI) + Docs.
  // Everything else stays off so new projects start lean — this replaces
  // the old post-create feature-selection step.
  page_view: true,
  cycle_view: false,
  module_view: false,
  issue_views_view: false,
  inbox_view: false,
});
