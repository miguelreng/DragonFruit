/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Design System/Layout",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
# Layout

How a page is assembled. These primitives exist so every screen shares the same
gutters, the same header rhythm and the same scroll behaviour — and so you never
hand-roll a page shell again.

The measurements here are not suggestions. They are what the app already does; a
screen that deviates reads as broken next to the others.
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

export const PageShell: Story = {
  name: "1. Anatomía de una página",
  render: () => (
    <Page>
      <Section
        title="El esqueleto"
        blurb="Toda vista de la app se compone igual: una franja de header, y debajo un contenedor de contenido que scrollea. Los dos vienen de @plane/ui."
      >
        <div className="overflow-hidden rounded-lg border border-subtle">
          <div className="flex h-14 items-center justify-between border-b border-subtle bg-surface-1 px-[1.35rem]">
            <span className="text-13 font-medium text-primary">Header · 56px</span>
            <span className="text-11 text-tertiary">EHeaderVariant.PRIMARY</span>
          </div>
          <div className="flex h-14 items-center justify-between border-b border-subtle bg-surface-1 px-[1.35rem]">
            <span className="text-13 text-secondary">Banda de tabs · h-14 fijo</span>
            <span className="text-11 text-tertiary">no usar h-11</span>
          </div>
          <div className="bg-layer-1 px-[1.35rem] py-6">
            <span className="text-13 text-secondary">ContentWrapper — scrollea, sin padding-top propio</span>
          </div>
        </div>

        <Snippet>{`import { Header, EHeaderVariant, ContentWrapper, ERowVariant } from "@plane/ui";

<Header variant={EHeaderVariant.PRIMARY}>
  <Header.LeftItem>{breadcrumbs}</Header.LeftItem>
  <Header.RightItem>{actions}</Header.RightItem>
</Header>

<ContentWrapper variant={ERowVariant.REGULAR}>
  {content}
</ContentWrapper>`}</Snippet>
      </Section>

      <Section
        title="El baseline de chrome — 56px"
        blurb="Los cuatro header strips de la app (switcher del sidebar, banda de tabs del proyecto, header de Atlas, AppHeader de pages) comparten una sola altura y una sola línea central."
      >
        <div className="space-y-2 text-13 text-secondary">
          <p>
            Altura <strong className="text-primary">56px</strong>, centerline en{" "}
            <strong className="text-primary">28px</strong>. La banda de tabs tiene que quedarse en{" "}
            <code>h-14</code> fijo para que las pestañas fusionadas encajen.
          </p>
          <p className="text-danger-primary">
            No reintroduzcas <code>h-11</code> ni paddings asimétricos en una franja de header: rompe la alineación con
            las otras tres y se nota al cambiar de sección.
          </p>
        </div>
      </Section>
    </Page>
  ),
};

export const Gutters: Story = {
  name: "2. Gutters y variantes de Row",
  render: () => (
    <Page>
      <Section
        title="Un solo gutter para toda la app"
        blurb="El margen horizontal de página es un token, no un número que eliges por vista."
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-subtle bg-layer-1">
            <div className="border-b border-subtle px-[1.35rem] py-3">
              <span className="text-12 text-primary">
                <code>ERowVariant.REGULAR</code> — <code>px-page-x</code> (1.35rem)
              </span>
            </div>
            <div className="px-0 py-3">
              <span className="px-3 text-12 text-tertiary">
                <code>ERowVariant.HUGGING</code> — <code>px-0</code>, para cuando el hijo pone su propio gutter
                (tablas, listas de ancho completo)
              </span>
            </div>
          </div>
        </div>
        <Snippet>{`// El contenido normal de una página
<Row variant={ERowVariant.REGULAR}>…</Row>

// Una tabla o lista que llega hasta el borde
<Row variant={ERowVariant.HUGGING}>…</Row>`}</Snippet>
        <p className="mt-3 text-12 text-tertiary">
          <code>--padding-page-x</code> y <code>--padding-page-y</code> valen <code>1.35rem</code>. Si necesitas otro
          margen, casi siempre la respuesta es <code>HUGGING</code> + el gutter del hijo, no un{" "}
          <code>px-[N]</code> nuevo.
        </p>
      </Section>

      <Section
        title="Variantes de Header"
        blurb="Tres niveles, y cada uno trae su propio z-index para que se apilen bien entre sí."
      >
        <div className="space-y-2 text-12">
          {[
            ["PRIMARY", "La franja principal de la vista", "—"],
            ["SECONDARY", "Sub-header; min-height 52px, oculto en móvil salvo showOnMobile", "z-[15]"],
            ["TERNARY", "Fila de filtros/acciones que envuelve", "z-[12]"],
          ].map(([v, d, z]) => (
            <div key={v} className="flex items-baseline gap-3 border-b border-subtle py-2 last:border-b-0">
              <code className="w-24 shrink-0 text-11 text-primary">{v}</code>
              <span className="flex-1 text-secondary">{d}</span>
              <code className="text-11 text-tertiary">{z}</code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};

export const Scrolling: Story = {
  name: "3. Scroll",
  render: () => (
    <Page>
      <Section
        title="El contenedor que scrollea no lleva padding superior"
        blurb="Va pegado bajo el header a propósito, para que el contenido pase por debajo y la sombra de scroll tenga algo que revelar."
      >
        <Snippet>{`<div className="scroll-shadow vertical-scrollbar overflow-y-auto">
  {content}
</div>`}</Snippet>
        <p className="mt-3 text-13 text-secondary">
          <code>.scroll-shadow</code> es una utilidad scroll-driven de{" "}
          <code>@plane/tailwind-config</code>: pinta una elevación en el borde superior sólo cuando hay contenido
          desplazado (<code>[data-scrolled=&quot;true&quot;]</code>). Reúsala en cualquier scroller nuevo — no montes tu
          propio gradiente.
        </p>
        <p className="mt-2 text-12 text-tertiary">
          También reserva el ancho de la barra para que revelar el thumb no desplace el layout.{" "}
          <code>ContentWrapper</code> con <code>ERowVariant.REGULAR</code> ya la aplica junto a{" "}
          <code>pb-page-y</code>.
        </p>
      </Section>
    </Page>
  ),
};
