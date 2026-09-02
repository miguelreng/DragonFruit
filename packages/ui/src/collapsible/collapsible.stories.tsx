/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Collapsible } from "./collapsible";

const meta = {
  title: "Components/Collapsible",
  component: Collapsible,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Collapsible>;
export default meta;
type Story = StoryObj<typeof meta>;

const Body = () => (
  <p className="px-2 py-3 text-13 text-secondary">
    El contenido se monta siempre; sólo se oculta. No lo uses para diferir trabajo caro.
  </p>
);

/** Sin estado propio: se abre y cierra solo. */
export const Uncontrolled: Story = {
  args: { title: "Detalles", defaultOpen: true, children: <Body /> },
};

/** Con `isOpen` + `onToggle` cuando varios paneles se coordinan (acordeón). */
export const Controlled: Story = {
  args: { title: "Sección", children: null },
  render: () => {
    const [open, setOpen] = React.useState<string | null>("a");
    return (
      <div className="max-w-md divide-y divide-subtle rounded-lg border border-subtle">
        {["a", "b", "c"].map((k) => (
          <Collapsible
            key={k}
            title={`Sección ${k.toUpperCase()}`}
            isOpen={open === k}
            onToggle={() => setOpen(open === k ? null : k)}
            className="px-3 py-2"
          >
            <Body />
          </Collapsible>
        ))}
      </div>
    );
  },
};
