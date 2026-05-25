/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFileSignedURLResponse } from "../file";

export type TIssueAttachment = {
  id: string;
  attributes: {
    name: string;
    size: number;
    type?: string;
    provider?: "google_drive" | string;
    webViewLink?: string;
    web_view_link?: string;
    iconLink?: string;
    thumbnailLink?: string;
  };
  asset_url: string;
  external_id?: string | null;
  external_source?: string | null;
  issue_id: string;
  // required
  updated_at: string;
  updated_by: string;
  created_by: string;
};

export type TIssueAttachmentUploadResponse = TFileSignedURLResponse & {
  attachment: TIssueAttachment;
};

export type TIssueAttachmentMap = {
  [issue_id: string]: TIssueAttachment;
};

export type TIssueAttachmentIdMap = {
  [issue_id: string]: string[];
};
