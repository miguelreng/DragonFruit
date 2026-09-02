/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@plane/propel/button";

const meta = {
  title: "Design System/Behaviors",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
# Behaviors

Movement, focus and stacking. Every rule on this page was learned by shipping a bug;
they are written down so the next person doesn't have to rediscover them.

If you find yourself writing a \`transition\`, a \`z-[N]\` or a focus style by hand,
stop and read the relevant section first.
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

const Snippet: React.FC<{ children: string }> = ({ children }) => (
  <pre className="overflow-x-auto rounded-md border border-subtle bg-layer-1 p-3 text-11 text-secondary">
    <code>{children}</code>
  </pre>
);

const Trap: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-lg border border-danger-subtle bg-layer-1 p-4">
    <h4 className="mb-2 text-13 font-semibold text-danger-primary">⚠️ {title}</h4>
    <div className="space-y-2 text-13 text-secondary">{children}</div>
  </div>
);

export const Motion: Story = {
  name: "1. Movimiento — las clases t-*",
  render: () => (
    <Page>
      <Section
        title="La animación compartida vive en tailwind-config, no en el componente"
        blurb="Se ajusta en packages/tailwind-config/index.css. Si retocas una transición en un archivo hoja, la estás desincronizando del resto de la app."
      >
        <div className="space-y-2 text-12">
          {[
            ["t-colors", "Transición de color, borde, sombra y opacidad. La base de casi todo control."],
            ["t-press", "Superset de t-colors + escala al presionar. Los botones reales la llevan; los variants link no."],
            ["t-focus", "El anillo de foco único del sistema. Sólo :focus-visible."],
            ["t-field", "Transición de campos de formulario (borde + sombra)."],
            ["t-dropdown", "Entrada/salida de poppers, con origen según el placement."],
            ["t-modal", "Entrada del panel de modal."],
            ["t-resize", "Transición de ancho/alto para paneles redimensionables."],
          ].map(([c, d]) => (
            <div key={c} className="flex items-baseline gap-3 border-b border-subtle py-2 last:border-b-0">
              <code className="w-24 shrink-0 text-11 text-primary">{c}</code>
              <span className="flex-1 text-secondary">{d}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-12 text-tertiary">
          Cada clase <code>t-*</code> es dueña de la propiedad abreviada <code>transition</code>, así que{" "}
          <strong>no componen entre sí</strong>: la última definida gana. Por eso <code>t-press</code> incluye el color
          en vez de apoyarse en <code>t-colors</code>. Todas respetan{" "}
          <code>prefers-reduced-motion</code> — no añadas tu propia guarda.
        </p>
      </Section>

      <Section title="Foco: nunca lo quites">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary">Tabula hasta aquí</Button>
          <span className="text-12 text-tertiary">
            <code>t-focus</code> pinta 2px de accent con 2px de offset, sólo en <code>:focus-visible</code>. Un clic de
            ratón no deja anillo.
          </span>
        </div>
        <Snippet>{`/* packages/tailwind-config/index.css */
.t-focus:focus-visible {
  outline: 2px solid var(--border-color-accent-strong);
  outline-offset: 2px;
}`}</Snippet>
        <p className="mt-3 text-12 text-danger-primary">
          <code>Button</code> e <code>IconButton</code> ya lo traen. Si montas un <code>&lt;button&gt;</code> a medida
          para una superficie realmente bespoke (celda de grid, nodo de canvas, día de calendario), añádele{" "}
          <code>t-focus</code> — si no, ese control es inalcanzable por teclado.
        </p>
      </Section>
    </Page>
  ),
};

export const Stacking: Story = {
  name: "2. Apilado y poppers",
  render: () => (
    <Page>
      <Section
        title="Los tiers de z-index"
        blurb="No inventes un z-[9999]. Estos son los niveles que la app ya usa; encaja en ellos."
      >
        <div className="space-y-2 text-12">
          {[
            ["z-[12]", "Header TERNARY (fila de filtros)"],
            ["z-[15]", "Header SECONDARY (sub-header)"],
            ["z-[100]", "Backdrop de ModalCore"],
            ["z-[110]", "Panel de ModalCore"],
            ["z-[120]", "Poppers portaleados a body que deben salir por encima de un modal"],
          ].map(([z, d]) => (
            <div key={z} className="flex items-baseline gap-3 border-b border-subtle py-2 last:border-b-0">
              <code className="w-20 shrink-0 text-11 text-primary">{z}</code>
              <span className="flex-1 text-secondary">{d}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-13 text-secondary">
          Un dropdown dentro de un modal es el caso que más se repite: si lo portaleas a <code>body</code> necesita{" "}
          <code>z-[120]</code> para superar el <code>z-[110]</code> del panel. Con menos, se abre por detrás del modal.
        </p>
      </Section>

      <Section
        title="Tres trampas que hacen desaparecer un popper"
        blurb="Los tres bugs son el mismo síntoma — el dropdown se abre fuera de sitio o no se ve — con tres causas distintas. Vale la pena reconocerlas."
      >
        <div className="space-y-4">
          <Trap title="Un transform en un ancestro captura el position: fixed">
            <p>
              Cualquier ancestro con <code>transform</code> (incluido un inocente <code>translate-y-0</code> puesto para
              apilar) crea un <em>containing block</em>: el popper <code>fixed</code> pasa a posicionarse respecto a ese
              elemento, no al viewport. Síntoma: el menú ⋯ se va fuera de pantalla en tarjetas scrolleadas o al fondo de
              una lista.
            </p>
            <p className="text-12 text-tertiary">
              Arreglo: usar <code>isolate</code> en vez de un transform para apilar, y <code>strategy: &quot;fixed&quot;</code>{" "}
              en el popper.
            </p>
          </Trap>

          <Trap title="Un mask-image recorta incluso lo fixed">
            <p>
              Un contenedor con <code>mask-image</code> (por ejemplo el degradado de scroll del app rail) recorta el
              pintado de sus descendientes <strong>aunque sean position: fixed</strong>.
            </p>
            <p className="text-12 text-tertiary">
              Arreglo: portalear fuera con <code>portalElement={"{document.body}"}</code> y pasar el tema al panel.
            </p>
          </Trap>

          <Trap title="El Popover de @plane/ui no portalea">
            <p>
              Renderiza en flujo, así que cualquier ancestro con <code>overflow-hidden</code> (una píldora de header,
              por ejemplo) lo recorta a nada — mientras el elemento sigue reportándose visible y con opacidad 1, lo que
              hace el diagnóstico confuso.
            </p>
            <p className="text-12 text-tertiary">
              Arreglo: usar <code>@plane/propel/popover</code>, que portalea correctamente.
            </p>
          </Trap>
        </div>
      </Section>
    </Page>
  ),
};

export const Feedback: Story = {
  name: "3. Feedback al usuario",
  render: () => (
    <Page>
      <Section
        title="Toast, modal o inline"
        blurb="Elegir mal es la causa de que la app se sienta ruidosa. La regla es por consecuencia, no por gusto."
      >
        <div className="space-y-2 text-13">
          {[
            ["Toast", "La acción terminó y el usuario puede seguir. Guardado, copiado, enviado.", "setToast"],
            ["Modal", "Necesitas una decisión antes de continuar. Confirmar algo destructivo.", "AlertModalCore"],
            ["Inline", "El error pertenece a un campo concreto y hay que corregirlo ahí.", "el error del propio input"],
          ].map(([k, d, c]) => (
            <div key={k} className="flex items-baseline gap-3 border-b border-subtle py-2 last:border-b-0">
              <strong className="w-16 shrink-0 text-primary">{k}</strong>
              <span className="flex-1 text-secondary">{d}</span>
              <code className="text-11 text-tertiary">{c}</code>
            </div>
          ))}
        </div>
        <Snippet>{`import { setToast, TOAST_TYPE } from "@plane/propel/toast";

setToast({
  type: TOAST_TYPE.SUCCESS,   // SUCCESS | ERROR | WARNING | INFO | LOADING
  title: "Project created",
  message: "You can invite members now.",
});`}</Snippet>
        <p className="mt-3 text-12 text-tertiary">
          Nunca uses un toast de error para algo que el usuario tiene que arreglar en un campo: el toast desaparece y el
          campo se queda sin señal.
        </p>
      </Section>
    </Page>
  ),
};
