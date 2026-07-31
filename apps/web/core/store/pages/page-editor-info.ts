/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { EditorRefApi, EditorTitleRefApi, TEditorAsset } from "@plane/editor";

export type TAtlasReviewPhase =
  | "idle"
  | "requesting"
  | "streaming"
  | "reviewing"
  | "resolving"
  | "applied"
  | "rejected"
  | "failed";

export type TAtlasReviewSnapshot = {
  bodyHtml: string;
  titleHtml: string;
};

export type TAtlasTitleProposal = {
  id: string;
  operation: "insert_after" | "replace" | "delete";
  status: "streaming" | "pending";
  targetOriginalText: string;
  contentText: string;
};

export type TAtlasReviewCoverage = {
  processed: number;
  total: number;
};

export type TPageEditorInstance = {
  // observables
  assetsList: TEditorAsset[];
  editorRef: EditorRefApi | null;
  titleEditorRef: EditorTitleRefApi | null;
  atlasReviewPhase: TAtlasReviewPhase;
  atlasReviewSnapshot: TAtlasReviewSnapshot | null;
  atlasTitleProposals: TAtlasTitleProposal[];
  atlasReviewCoverage: TAtlasReviewCoverage | null;
  // actions
  setEditorRef: (editorRef: EditorRefApi | null) => void;
  setTitleEditorRef: (editorRef: EditorTitleRefApi | null) => void;
  setAtlasReviewPhase: (phase: TAtlasReviewPhase) => void;
  setAtlasReviewSnapshot: (snapshot: TAtlasReviewSnapshot | null) => void;
  setAtlasTitleProposals: (proposals: TAtlasTitleProposal[]) => void;
  setAtlasReviewCoverage: (coverage: TAtlasReviewCoverage | null) => void;
  updateAssetsList: (assets: TEditorAsset[]) => void;
};

export class PageEditorInstance implements TPageEditorInstance {
  // observables
  editorRef: EditorRefApi | null = null;
  titleEditorRef: EditorTitleRefApi | null = null;
  atlasReviewPhase: TAtlasReviewPhase = "idle";
  atlasReviewSnapshot: TAtlasReviewSnapshot | null = null;
  atlasTitleProposals: TAtlasTitleProposal[] = [];
  atlasReviewCoverage: TAtlasReviewCoverage | null = null;
  assetsList: TEditorAsset[] = [];

  constructor() {
    makeObservable(this, {
      // observables
      editorRef: observable.ref,
      titleEditorRef: observable.ref,
      atlasReviewPhase: observable.ref,
      atlasReviewSnapshot: observable.ref,
      atlasTitleProposals: observable.ref,
      atlasReviewCoverage: observable.ref,
      assetsList: observable,
      // actions
      setEditorRef: action,
      setTitleEditorRef: action,
      setAtlasReviewPhase: action,
      setAtlasReviewSnapshot: action,
      setAtlasTitleProposals: action,
      setAtlasReviewCoverage: action,
      updateAssetsList: action,
    });
  }

  setEditorRef: TPageEditorInstance["setEditorRef"] = (editorRef) => {
    runInAction(() => {
      this.editorRef = editorRef;
    });
  };

  setTitleEditorRef: TPageEditorInstance["setTitleEditorRef"] = (titleEditorRef) => {
    runInAction(() => {
      this.titleEditorRef = titleEditorRef;
    });
  };

  setAtlasReviewPhase: TPageEditorInstance["setAtlasReviewPhase"] = (atlasReviewPhase) => {
    runInAction(() => {
      this.atlasReviewPhase = atlasReviewPhase;
    });
  };

  setAtlasReviewSnapshot: TPageEditorInstance["setAtlasReviewSnapshot"] = (atlasReviewSnapshot) => {
    runInAction(() => {
      this.atlasReviewSnapshot = atlasReviewSnapshot;
    });
  };

  setAtlasTitleProposals: TPageEditorInstance["setAtlasTitleProposals"] = (atlasTitleProposals) => {
    runInAction(() => {
      this.atlasTitleProposals = atlasTitleProposals;
    });
  };

  setAtlasReviewCoverage: TPageEditorInstance["setAtlasReviewCoverage"] = (atlasReviewCoverage) => {
    runInAction(() => {
      this.atlasReviewCoverage = atlasReviewCoverage;
    });
  };

  updateAssetsList: TPageEditorInstance["updateAssetsList"] = (assets) => {
    runInAction(() => {
      this.assetsList = assets;
    });
  };
}
