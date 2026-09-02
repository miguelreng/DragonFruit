/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircularProgressIndicator } from "./circular-progress-indicator";
import { LinearProgressIndicator } from "./linear-progress-indicator";

const meta = {
  title: "Components/Progress",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const DATA = [
  { id: "done", name: "Completadas", value: 12, color: "#16a34a" },
  { id: "wip", name: "En curso", value: 6, color: "#f59e0b" },
  { id: "todo", name: "Pendientes", value: 9, color: "#94a3b8" },
];

/**
 * Barra segmentada: úsala cuando el total se **reparte** entre categorías.
 * Cada segmento lleva su tooltip salvo `noTooltip`.
 */
export const Linear: Story = {
  render: () => (
    <div className="max-w-md space-y-5">
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <div key={size} className="space-y-1.5">
          <code className="text-11 text-tertiary">{size}</code>
          <LinearProgressIndicator data={DATA} size={size} />
        </div>
      ))}
    </div>
  ),
};

/** Anillo: para un único porcentaje, normalmente junto a un número. */
export const Circular: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      {[25, 60, 100].map((p) => (
        <CircularProgressIndicator key={p} size={44} percentage={p} strokeWidth={5}>
          <span className="text-11 font-medium text-primary">{p}%</span>
        </CircularProgressIndicator>
      ))}
    </div>
  ),
};
