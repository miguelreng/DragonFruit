/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkItemBlock } from "./block";

const meta = {
  title: "Components/LinkItemBlock",
  component: LinkItemBlock,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof LinkItemBlock>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Tarjeta de enlace guardado. El icono se deduce del dominio de `url`, así que
 * no hay que pasarlo: pasar un icono a mano es señal de que quieres otra cosa.
 */
export const Default: Story = {
  args: { title: "Documentación de la API", url: "https://github.com/dragonfruit/dragonfruit" },
};

export const WithDate: Story = {
  args: {
    title: "Especificación del sprint",
    url: "https://www.notion.so/spec",
    createdAt: "2026-08-01",
  },
};

/** Varios dominios, para ver la deducción del icono. */
export const IconByDomain: Story = {
  args: { title: "Enlace", url: "https://example.com" },
  render: () => (
    <div className="flex flex-wrap gap-3">
      {[
        ["Repositorio", "https://github.com/org/repo"],
        ["Diseño", "https://www.figma.com/file/abc"],
        ["Nota", "https://www.notion.so/page"],
        ["Enlace suelto", "https://example.com/algo"],
      ].map(([title, url]) => (
        <LinkItemBlock key={url} title={title} url={url} />
      ))}
    </div>
  ),
};
