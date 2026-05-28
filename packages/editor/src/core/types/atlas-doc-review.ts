/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Content } from "@tiptap/core";

export type TAtlasDocWriteMode = "create" | "update";

export type TAtlasDocEditOperation = "insert_after" | "replace" | "delete";

export type TAtlasDocProposalStatus = "streaming" | "pending" | "accepted" | "rejected" | "stale" | "failed";

export type TAtlasDocReviewSession = {
  id: string;
  mode: TAtlasDocWriteMode;
  anchorPos?: number;
};

export type TAtlasDocReviewProposal = {
  id: string;
  sessionId?: string;
  operation: TAtlasDocEditOperation;
  status: TAtlasDocProposalStatus;
  anchorPos?: number;
  targetBlockId?: string;
  targetOriginalText?: string;
  contentText?: string;
  contentHtml?: Content;
};

export type TAtlasDocReviewProposalUpdate = Partial<
  Pick<TAtlasDocReviewProposal, "status" | "contentText" | "contentHtml" | "targetOriginalText" | "targetBlockId">
>;
