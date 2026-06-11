/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor, Range } from "@tiptap/core";
import type { CSSProperties } from "react";
import type { TEditorCommands } from "@/types";

export type CommandProps = {
  editor: Editor;
  range: Range;
};

export type TSlashCommandSectionKeys = "general" | "work" | "text-colors" | "background-colors";

export type ISlashCommandItem = {
  commandKey: TEditorCommands;
  key: string;
  title: string;
  description: string;
  searchTerms: string[];
  icon: React.ReactNode;
  iconContainerStyle?: CSSProperties;
  command: ({ editor, range }: CommandProps) => void;
  badge?: React.ReactNode;
  /**
   * Keeps the command selected in the dropdown while the user types an
   * argument after it ("/wiki photosynthesis"), so Enter executes the
   * command with the typed argument instead of dismissing the menu.
   */
  acceptsArguments?: boolean;
};
