/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type IEditorExtensionOptions = unknown;

export type IEditorPropsExtended = unknown;

export type ICollaborativeDocumentEditorPropsExtended = unknown;

/** DragonFruit: agent webhook + wiki lookup + wiki @mention + cite-this + glossary/citation tools (see ce/extensions/slash-commands.tsx). */
export type TExtendedEditorCommands = "agent" | "wiki" | "cite" | "link-terms" | "check-citations";

export type TExtendedCommandExtraProps = unknown;

export type TExtendedEditorRefApi = unknown;
