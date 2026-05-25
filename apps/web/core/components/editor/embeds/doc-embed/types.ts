/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IProjectView, TPage, TSticky } from "@plane/types";

export type TDocEmbedSourceType = "whiteboard" | "sticky" | "task_view" | "google_drive";

export type TDocEmbedSource =
  | {
      type: "whiteboard";
      id: string;
      title: string;
      projectId?: string;
      page: TPage;
    }
  | {
      type: "sticky";
      id: string;
      title: string;
      sticky: TSticky;
    }
  | {
      type: "task_view";
      id: string;
      title: string;
      projectId: string;
      view: IProjectView;
    }
  | {
      type: "google_drive";
      id: string;
      title: string;
      url: string;
      mimeType?: string;
    };
