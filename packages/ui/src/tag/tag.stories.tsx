/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ETagSize, ETagVariant } from "./helper";
import { Tag } from "./tag";

const meta = {
  title: "Components/Tag",
  component: Tag,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { children: "Etiqueta" },
} satisfies Meta<typeof Tag>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Tag vs Badge: un Badge comunica **estado** (activo, vencido, error). Un Tag
 * comunica **pertenencia** — una etiqueta que el usuario puso.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Tag variant={ETagVariant.OUTLINED} size={ETagSize.SM}>
        sm
      </Tag>
      <Tag variant={ETagVariant.OUTLINED} size={ETagSize.LG}>
        lg
      </Tag>
    </div>
  ),
};
