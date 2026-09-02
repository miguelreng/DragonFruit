/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColorPicker } from "./color-picker";

const meta = {
  title: "Components/ColorPicker",
  component: ColorPicker,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof ColorPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Envuelve el `<input type="color">` nativo: el picker lo pone el sistema operativo. */
export const Default: Story = {
  args: { value: "#AA0276", onChange: () => {} },
  render: () => {
    const [color, setColor] = React.useState("#AA0276");
    return (
      <div className="flex items-center gap-3">
        <ColorPicker value={color} onChange={setColor} />
        <code className="text-12 text-secondary">{color}</code>
      </div>
    );
  },
};
