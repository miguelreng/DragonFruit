/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@dragonfruit/propel/button";
import { Spinner } from "@dragonfruit/propel/spinners";
import { Tooltip } from "@dragonfruit/propel/tooltip";
import { Avatar } from "../avatar";
import { Loader } from "../loader";
import { EModalWidth, EModalPosition } from "../modals";

const meta = {
  title: "Design System/Component Catalog",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
# Component catalog

**Read this before building a new view.** Every recurring piece of UI in DragonFruit
already has a component. The point of this page is that you stop inventing behaviour,
usage and variants per screen.

Each section answers three things: *which component owns this slot*, *what its variants
are*, and *what people reach for instead when they shouldn't*.

Numbers quoted are real adoption counts measured across \`apps/web\`, \`apps/space\` and
\`apps/admin\`.
        `,
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* -----------------------------------------------------------------------------
   Presentation helpers
   ---------------------------------------------------------------------------*/

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

/** The canonical component for a slot, what it replaces, and how it's imported. */
const Slot: React.FC<{
  slot: string;
  use: string;
  from: string;
  instead?: string;
  children?: React.ReactNode;
}> = ({ slot, use, from, instead, children }) => (
  <div className="space-y-3 border-b border-subtle py-4 last:border-b-0">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h4 className="text-13 font-semibold text-primary">{slot}</h4>
      <code className="rounded bg-layer-1 px-1.5 py-0.5 text-11 text-primary">{use}</code>
      <span className="text-11 text-tertiary">{from}</span>
    </div>
    {instead ? (
      <p className="text-12 text-danger-primary">
        <strong>No uses:</strong> {instead}
      </p>
    ) : null}
    {children}
  </div>
);

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="rounded bg-layer-1 px-1.5 py-0.5 text-11 text-secondary">{children}</code>
);

/* -----------------------------------------------------------------------------
   Stories
   ---------------------------------------------------------------------------*/

export const SlotMap: Story = {
  name: "1. Slot map — start here",
  render: () => (
    <Page>
      <Section
        title="One component per slot"
        blurb="If what you're building matches a row below, use that component. If it almost matches, extend the component — do not fork it into your view."
      >
        <Slot
          slot="Button with a label"
          use="<Button>"
          from="@dragonfruit/propel/button"
          instead="un <button> a mano con clases copiadas"
        >
          <p className="text-12 text-tertiary">
            Variantes: <Pill>primary</Pill> <Pill>secondary</Pill> <Pill>tertiary</Pill> <Pill>ghost</Pill>{" "}
            <Pill>error-fill</Pill> <Pill>error-outline</Pill> <Pill>link</Pill> <Pill>link-accent</Pill> · Ver{" "}
            <strong>Design System / Buttons</strong>.
          </p>
        </Slot>

        <Slot
          slot="Icon-only button"
          use="<IconButton>"
          from="@dragonfruit/propel/icon-button"
          instead='<button className="grid size-6 place-items-center …"> (46 casos, bajando desde 127)'
        />

        <Slot
          slot="Modal / dialog"
          use="<ModalCore>"
          from="@dragonfruit/ui"
          instead="<Dialog> de @headlessui directo (8 archivos) o un overlay fixed inset-0 a mano (9 archivos)"
        >
          <p className="text-12 text-tertiary">
            Confirmaciones destructivas → <Pill>{"<AlertModalCore>"}</Pill>, que ya trae el icono, el copy y el botón
            correcto.
          </p>
        </Slot>

        <Slot
          slot="Dropdown / menú"
          use="<CustomMenu>"
          from="@dragonfruit/ui"
          instead="<Menu> de @headlessui directo (6 archivos)"
        >
          <p className="text-12 text-tertiary">
            Elegir un valor → <Pill>{"<CustomSelect>"}</Pill>. Elegir con búsqueda → <Pill>{"<CustomSearchSelect>"}</Pill>
            .
          </p>
        </Slot>

        <Slot
          slot="Tooltip"
          use="<Tooltip>"
          from="@dragonfruit/propel/tooltip"
          instead="el atributo title= nativo sobre botones y enlaces (59 casos hoy)"
        />

        <Slot
          slot="Skeleton de carga"
          use="<Loader> + <Loader.Item>"
          from="@dragonfruit/ui"
        />

        <Slot slot="Spinner" use="<Spinner>" from="@dragonfruit/propel/spinners" />

        <Slot slot="Avatar" use="<Avatar> / <AvatarGroup>" from="@dragonfruit/ui" instead="un <img> con rounded-full" />
      </Section>
    </Page>
  ),
};

export const Modals: Story = {
  name: "2. Modals",
  render: () => (
    <Page>
      <Section
        title="ModalCore es el contenedor; tú pones el contenido"
        blurb="ModalCore resuelve backdrop, foco atrapado, cierre con Escape, scroll lock y animación. Nunca vuelvas a montar eso a mano."
      >
        <Snippet>{`import { ModalCore, EModalWidth, EModalPosition } from "@dragonfruit/ui";

<ModalCore
  isOpen={isOpen}
  handleClose={onClose}
  width={EModalWidth.XXL}          // default
  position={EModalPosition.CENTER} // default
>
  {/* tu contenido */}
</ModalCore>`}</Snippet>
        <div className="mt-4 space-y-2">
          <p className="text-12 text-tertiary">
            <strong className="text-secondary">Anchos</strong> (<code>EModalWidth</code>):{" "}
            {Object.keys(EModalWidth).map((k) => (
              <Pill key={k}>{k}</Pill>
            ))}
          </p>
          <p className="text-12 text-tertiary">
            <strong className="text-secondary">Posiciones</strong> (<code>EModalPosition</code>):{" "}
            {Object.keys(EModalPosition).map((k) => (
              <Pill key={k}>{k}</Pill>
            ))}
          </p>
        </div>
      </Section>

      <Section
        title="AlertModalCore para confirmar algo destructivo"
        blurb="No montes un ModalCore con tu propio icono y tus propios botones para pedir una confirmación. AlertModalCore ya define la jerarquía correcta: Cancel secundario, la acción en su variante de riesgo."
      >
        <Snippet>{`import { AlertModalCore } from "@dragonfruit/ui";

<AlertModalCore
  isOpen={isOpen}
  variant="danger"            // "danger" | "primary"
  title="Delete project"
  content="This cannot be undone."
  primaryButtonText={{ default: "Delete", loading: "Deleting" }}
  handleClose={onClose}
  handleSubmit={onDelete}
  isSubmitting={isDeleting}
/>`}</Snippet>
        <p className="mt-3 text-12 text-tertiary">
          <Pill>danger</Pill> pinta el botón <code>error-fill</code>; <Pill>primary</Pill> lo pinta{" "}
          <code>primary</code>. El icono y el color del encabezado salen de la variante — no los pases a mano.
        </p>
      </Section>
    </Page>
  ),
};

export const Loading: Story = {
  name: "3. Estados de carga",
  render: () => (
    <Page>
      <Section
        title="Skeleton, no spinner, cuando conoces la forma"
        blurb="Si sabes qué va a aparecer (una lista, una tarjeta, una tabla), dibuja su silueta con Loader. El spinner es para esperas donde no puedes anticipar el layout."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-12 text-tertiary">
              <code>{"<Loader>"}</code> — silueta del contenido
            </p>
            <div className="rounded-lg border border-subtle bg-layer-2 p-4">
              <Loader className="space-y-3">
                <Loader.Item height="16px" width="60%" />
                <Loader.Item height="12px" width="90%" />
                <Loader.Item height="12px" width="75%" />
              </Loader>
            </div>
            <Snippet>{`<Loader className="space-y-3">
  <Loader.Item height="16px" width="60%" />
  <Loader.Item height="12px" width="90%" />
</Loader>`}</Snippet>
          </div>
          <div>
            <p className="mb-2 text-12 text-tertiary">
              <code>{"<Spinner>"}</code> — espera sin forma conocida
            </p>
            <div className="flex items-center justify-center rounded-lg border border-subtle bg-layer-2 p-4">
              <Spinner height="28px" width="28px" />
            </div>
            <Snippet>{`import { Spinner } from "@dragonfruit/propel/spinners";

<Spinner height="28px" width="28px" />`}</Snippet>
          </div>
        </div>
        <p className="mt-4 text-12 text-tertiary">
          Ojo con un falso positivo: <code>animate-pulse</code> aparece en ~35 archivos, pero casi todos están en{" "}
          <code>core/components/ui/loader/*</code>, que son esqueletos <strong>hechos a medida por layout</strong> y
          construidos sobre esta misma idea — no son reinvenciones. Lo mismo con <code>animate-spin</code>: la mayoría
          son iconos que giran a propósito (<code>RefreshCw</code> al refrescar), no spinners genéricos.
        </p>
      </Section>

      <Section title="Dentro de un botón, no montes nada">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button variant="secondary" loading>
            Creating
          </Button>
          <span className="text-12 text-tertiary">
            <code>loading</code> ya deshabilita, pinta el spinner y marca <code>aria-busy</code>.
          </span>
        </div>
      </Section>
    </Page>
  ),
};

export const TooltipsAndAvatars: Story = {
  name: "4. Tooltips y avatares",
  render: () => (
    <Page>
      <Section
        title="Tooltip, nunca title="
        blurb="El atributo title nativo no se puede estilar, tarda ~1s en aparecer, no existe en táctil y no respeta el tema. Solo es aceptable para revelar texto truncado."
      >
        <div className="flex flex-wrap items-center gap-6">
          <Tooltip tooltipContent="Así se ve el nuestro" position="top">
            <span className="inline-block">
              <Button variant="secondary">Pásame el ratón por encima</Button>
            </span>
          </Tooltip>
          <button
            type="button"
            title="Así se ve el nativo — descolorido y con retardo"
            className="t-colors t-focus rounded-lg border border-subtle bg-layer-2 px-2 py-1 text-13 text-secondary"
          >
            title= nativo
          </button>
        </div>
        <Snippet>{`import { Spinner } from "@dragonfruit/propel/spinners";
import { Tooltip } from "@dragonfruit/propel/tooltip";

<Tooltip tooltipContent="Archivar tarea" position="top">
  <span className="inline-block">{trigger}</span>
</Tooltip>`}</Snippet>
        <p className="mt-3 text-12 text-tertiary">
          Un tooltip <strong>no</strong> sustituye al nombre accesible: un botón de solo icono necesita además su{" "}
          <code>aria-label</code>.
        </p>
      </Section>

      <Section title="Avatar" blurb="Una sola forma de pintar una persona. Nunca un <img rounded-full> suelto.">
        <div className="flex flex-wrap items-center gap-4">
          {(["sm", "base", "lg"] as const).map((size) => (
            <div key={size} className="flex items-center gap-2">
              <Avatar name="Miguel Rengifo" size={size} />
              <code className="text-11 text-tertiary">{size}</code>
            </div>
          ))}
        </div>
        <Snippet>{`import { Avatar, AvatarGroup } from "@dragonfruit/ui";

<Avatar name={member.display_name} src={member.avatar_url} size="base" />

<AvatarGroup max={3}>
  {members.map((m) => <Avatar key={m.id} name={m.display_name} src={m.avatar_url} />)}
</AvatarGroup>`}</Snippet>
      </Section>
    </Page>
  ),
};

export const EmptyStates: Story = {
  name: "5. Empty states",
  render: () => (
    <Page>
      <Section
        title="Tres, y cada uno tiene su sitio"
        blurb="No son redundantes: se diferencian por si la vista ofrece una acción y por si ocupa la página entera o vive dentro de un widget. Elegir por esas dos preguntas, no por gusto."
      >
        <div className="space-y-2 text-13">
          {[
            [
              "DetailedEmptyState",
              "Vista completa, y el usuario tiene algo que hacer",
              "primaryButton / secondaryButton",
              "pantalla de estimates, actividad del perfil",
            ],
            [
              "SimpleEmptyState",
              "Widget o panel sin acción — sólo informa de que no hay datos",
              "size sm | lg",
              "progreso y productividad del ciclo",
            ],
            [
              "SectionEmptyState",
              "Dentro de una sección que necesita su propia acción inline",
              "actionElement",
              "lista de sub-tareas",
            ],
          ].map(([c, when, api, ex]) => (
            <div key={c} className="border-b border-subtle py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <code className="text-12 text-primary">{c}</code>
                <code className="text-11 text-tertiary">{api}</code>
              </div>
              <p className="mt-1 text-secondary">{when}</p>
              <p className="mt-0.5 text-11 text-tertiary">Hoy: {ex}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="La convención visual"
        blurb="Barrida en 2026-08-10 y vigente: cero ilustraciones."
      >
        <ul className="list-disc space-y-2 pl-5 text-13 text-secondary">
          <li>
            Glifo Solar duotono en gris. Nada de imágenes — el registro de <code>assetKey</code> de propel ya renderiza
            iconos.
          </li>
          <li>
            Las pestañas de contenido <strong>no llevan botón de acción</strong> en su empty state.
          </li>
          <li>
            Un estado vacío <em>por filtro</em> es distinto de uno vacío de verdad: glifo de búsqueda y un{" "}
            <strong>Clear filters</strong>.
          </li>
        </ul>
      </Section>
    </Page>
  ),
};

export const KnownDuplicates: Story = {
  name: "6. Duplicados conocidos",
  render: () => (
    <Page>
      <Section
        title="Los mismos conceptos existen en los dos paquetes"
        blurb="Consecuencia de la historia del fork, no una decisión. Hasta que se consoliden, usa la columna «canónico» — es la que domina en la app y la que recibe los arreglos."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-subtle text-left text-12 text-tertiary">
                <th className="py-2 pr-4 font-medium">Slot</th>
                <th className="py-2 pr-4 font-medium">Canónico</th>
                <th className="py-2 pr-4 font-medium">Duplicado a evitar</th>
                <th className="py-2 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {[
                ["Button", "@dragonfruit/propel/button", "— (ya consolidado)", "Una sola implementación; hay regla de lint"],
                ["Tooltip", "@dragonfruit/propel/tooltip", "— (consolidado)", "el de @dragonfruit/ui fue borrado"],
                ["Dropdown", "@dragonfruit/ui CustomMenu", "— (consolidado)", "propel/menu borrado"],
                ["Avatar", "@dragonfruit/ui", "— (consolidado)", "propel/avatar borrado"],
                ["Spinner", "@dragonfruit/propel/spinners", "— (consolidado)", "el de @dragonfruit/ui fue borrado"],
                ["Skeleton", "@dragonfruit/ui Loader", "— (consolidado)", "propel/skeleton borrado, tenía 0 usos"],
                ["Card", "@dragonfruit/propel/card", "— (consolidado)", "eran copias idénticas"],
                ["Popover", "@dragonfruit/propel/popover", "@dragonfruit/ui", "⚠️ el de ui NO portalea: un overflow-hidden lo recorta"],
                ["Table", "ambos, a propósito", "—", "propel = primitivos; ui = renderer data/columns"],
              ].map(([a, b, c, d]) => (
                <tr key={a} className="border-b border-subtle last:border-b-0">
                  <td className="py-2 pr-4">{a}</td>
                  <td className="py-2 pr-4">
                    <code className="text-11 text-primary">{b}</code>
                  </td>
                  <td className="py-2 pr-4">
                    <code className="text-11 text-tertiary">{c}</code>
                  </td>
                  <td className="py-2 text-11 text-tertiary">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-12 text-tertiary">
          Regla mientras tanto: <strong>no importes el mismo concepto desde los dos paquetes en un mismo archivo.</strong>{" "}
          Es la señal que delató el Button legacy.
        </p>
      </Section>
    </Page>
  ),
};
