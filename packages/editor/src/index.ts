/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// editors
export {
  CollaborativeDocumentEditorWithRef,
  DocumentEditorWithRef,
  LiteTextEditorWithRef,
  RichTextEditorWithRef,
} from "@/components/editors";

// brand logos
export * from "@/components/logos";

// constants
export * from "@/constants/common";

// helpers
export * from "@/helpers/common";
export * from "@/helpers/yjs-utils";
export * from "@/helpers/wikipedia-client";
export * from "@/helpers/wiki-glossary";
export * from "@/helpers/wiki-citations";
export { CollaborationProvider, useCollaboration } from "@/contexts/collaboration-context";
export { RealtimePresence, RealtimePresenceLayer } from "@/components/presence/realtime-presence";
export { useRealtimePresence } from "@/hooks/use-realtime-presence";
export type {
  TPresenceMember,
  TPresenceParticipant,
  TPresenceSelection,
  TPresenceSurface,
} from "@/hooks/use-realtime-presence";

export { CORE_EXTENSIONS } from "@/constants/extension";
export { ADDITIONAL_EXTENSIONS } from "@/plane-editor/constants/extensions";

// types
export * from "@/types";

// additional exports
export { TrailingNode } from "./core/extensions/trailing-node";
