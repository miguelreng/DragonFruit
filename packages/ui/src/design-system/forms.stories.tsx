/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@dragonfruit/propel/button";
import { Checkbox, Input, TextArea } from "../form-fields";
import { ToggleSwitch } from "../toggle-switch";

const meta = {
  title: "Design System/Forms",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
# Forms

Los campos comparten tres cosas: la escala de tamaños, el estado de error y el de
disabled. Si un formulario nuevo los declara a mano, se desincroniza del resto.

Regla que se rompe más a menudo: **el error de un campo va en el campo**, no en un
toast. Un toast desaparece y deja al usuario sin saber qué corregir.
        `,
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-8 bg-canvas p-8">{children}</div>
);

const Section: React.FC<{ title: string; blurb?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  blurb,
  children,
}) => (
  <section className="space-y-4">
    <div className="space-y-1">
      <h3 className="text-16 font-semibold text-primary">{title}</h3>
      {blurb ? <p className="max-w-[72ch] text-13 text-secondary">{blurb}</p> : null}
    </div>
    <div className="rounded-lg border border-subtle bg-surface-1 p-6">{children}</div>
  </section>
);

const Row: React.FC<{ label: string; note?: string; children: React.ReactNode }> = ({ label, note, children }) => (
  <div className="grid grid-cols-[9rem_1fr] items-start gap-4 border-b border-subtle py-3 last:border-b-0">
    <div className="pt-1">
      <code className="text-12 text-primary">{label}</code>
      {note ? <p className="mt-1 text-11 text-tertiary">{note}</p> : null}
    </div>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </div>
);

const Snippet: React.FC<{ children: string }> = ({ children }) => (
  <pre className="overflow-x-auto rounded-md border border-subtle bg-layer-1 p-3 text-11 text-secondary">
    <code>{children}</code>
  </pre>
);

export const Fields: Story = {
  name: "1. Campos",
  render: () => (
    <Page>
      <Section title="Input" blurb="Tres tamaños y tres modos. El modo transparente es para edición en sitio, no para formularios.">
        <Row label="inputSize" note="xs · sm (default) · md">
          <Input inputSize="xs" placeholder="xs" />
          <Input inputSize="sm" placeholder="sm" />
          <Input inputSize="md" placeholder="md" />
        </Row>
        <Row label="mode" note="primary · transparent">
          <Input mode="primary" placeholder="primary — con borde" />
          <Input mode="transparent" placeholder="transparent — edición en sitio" />
        </Row>
        <Row label="hasError" note="El borde lo dice.">
          <Input hasError placeholder="Este campo falla" defaultValue="no-es-un-email" />
        </Row>
        <Row label="disabled">
          <Input disabled placeholder="No editable" />
        </Row>
      </Section>

      <Section title="TextArea" blurb="Mismos modos y mismo estado de error que Input, para que un formulario mixto no se vea de dos sistemas.">
        <Row label="primary">
          <TextArea placeholder="Descripción" className="w-full" rows={3} />
        </Row>
        <Row label="hasError">
          <TextArea hasError placeholder="Descripción" className="w-full" rows={3} />
        </Row>
      </Section>
    </Page>
  ),
};

export const Controls: Story = {
  name: "2. Controles binarios",
  render: () => {
    const [on, setOn] = React.useState(true);
    const [checked, setChecked] = React.useState(true);
    return (
      <Page>
        <Section
          title="Switch vs Checkbox — no son intercambiables"
          blurb="Un switch aplica su efecto de inmediato. Un checkbox marca una intención que se confirma al enviar el formulario. Elegir mal hace que el usuario no sepa si algo ya pasó."
        >
          <Row label="ToggleSwitch" note="Efecto inmediato">
            <ToggleSwitch value={on} onChange={setOn} label="Notificaciones" size="sm" />
            <ToggleSwitch value={on} onChange={setOn} label="Notificaciones" size="md" />
            <ToggleSwitch value={false} onChange={() => {}} label="Apagado" disabled />
            <span className="text-12 text-tertiary">“Activar notificaciones” — se guarda solo.</span>
          </Row>
          <Row label="Checkbox" note="Se confirma al enviar">
            <Checkbox checked={checked} onChange={() => setChecked((v) => !v)} />
            <Checkbox indeterminate onChange={() => {}} />
            <Checkbox checked disabled onChange={() => {}} />
            <span className="text-12 text-tertiary">
              Selección múltiple y estados parciales (<code>indeterminate</code>).
            </span>
          </Row>
        </Section>

        <Section title="Un formulario completo" blurb="Composición típica: campos, control binario y la jerarquía de botones al pie.">
          <div className="max-w-md space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="ds-name" className="text-12 font-medium text-secondary">
                Nombre del proyecto
              </label>
              <Input id="ds-name" placeholder="Marketing Q4" className="w-full" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ds-desc" className="text-12 font-medium text-secondary">
                Descripción
              </label>
              <TextArea id="ds-desc" placeholder="De qué va este proyecto" className="w-full" rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <ToggleSwitch value={on} onChange={setOn} label="Proyecto privado" />
              <span className="text-13 text-secondary">Proyecto privado</span>
            </div>
            <div className="flex justify-end gap-2 border-t border-subtle pt-4">
              <Button variant="secondary">Cancelar</Button>
              <Button variant="primary">Crear proyecto</Button>
            </div>
          </div>
        </Section>
      </Page>
    );
  },
};

export const Selects: Story = {
  name: "3. Selects",
  render: () => (
    <Page>
      <Section
        title="Cuál de los tres"
        blurb="Los tres viven en @dragonfruit/ui y se eligen por cuántas opciones hay, no por gusto."
      >
        <div className="space-y-2 text-13">
          {[
            ["CustomSelect", "Pocas opciones, todas visibles de golpe", "prioridad, estado"],
            ["CustomSearchSelect", "Demasiadas para escanear — necesita buscar", "asignar miembro, etiquetas"],
            ["CustomMenu", "No eliges un valor, ejecutas una acción", "menú ⋯ de una fila"],
          ].map(([c, when, ex]) => (
            <div key={c} className="border-b border-subtle py-3 last:border-b-0">
              <code className="text-12 text-primary">{c}</code>
              <p className="mt-1 text-secondary">{when}</p>
              <p className="mt-0.5 text-11 text-tertiary">Ej: {ex}</p>
            </div>
          ))}
        </div>
        <Snippet>{`import { CustomSelect, CustomSearchSelect, CustomMenu } from "@dragonfruit/ui";

<CustomSelect value={priority} onChange={setPriority} label={label}>
  {options.map((o) => (
    <CustomSelect.Option key={o.value} value={o.value}>{o.label}</CustomSelect.Option>
  ))}
</CustomSelect>`}</Snippet>
        <p className="mt-3 text-12 text-tertiary">
          Un select dentro de un modal necesita que su popper salga por encima del panel: ver los tiers de z-index en{" "}
          <strong>Design System / Behaviors</strong>.
        </p>
      </Section>

      <Section title="Errores">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-success-subtle bg-layer-1 p-4">
            <h4 className="mb-2 text-13 font-semibold text-primary">✅ El error vive en el campo</h4>
            <div className="space-y-1.5">
              <Input hasError defaultValue="no-es-un-email" className="w-full" />
              <p className="text-11 text-danger-primary">Introduce un email válido, como nombre@empresa.com.</p>
            </div>
          </div>
          <div className="rounded-lg border border-danger-subtle bg-layer-1 p-4">
            <h4 className="mb-2 text-13 font-semibold text-danger-primary">🚫 El error en un toast</h4>
            <p className="text-13 text-secondary">
              Desaparece a los segundos y deja el campo sin marcar. El usuario se queda sin saber cuál de los seis
              campos hay que corregir.
            </p>
          </div>
        </div>
      </Section>
    </Page>
  ),
};
