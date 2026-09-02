/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@dragonfruit/propel/button";
import type { TButtonVariant, TButtonSize } from "@dragonfruit/propel/button";
import { IconButton } from "@dragonfruit/propel/icon-button";

const meta = {
  title: "Design System/Buttons",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
# Buttons

The button contract for DragonFruit. Two primitives cover every clickable affordance
in the product:

- **\`Button\`** (\`@dragonfruit/propel/button\`) — anything with a text label.
- **\`IconButton\`** (\`@dragonfruit/propel/icon-button\`) — a bare glyph in a square hit target.

There is no third option. A hand-rolled \`<button className="...">\` is a bug unless it
is a genuinely bespoke surface (a canvas node, a grid cell, a calendar day). Everything
below is the reference for choosing correctly.
        `,
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* -----------------------------------------------------------------------------
   Presentation helpers — kept local so the guide is self-contained.
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
      {blurb ? <p className="max-w-[68ch] text-13 text-secondary">{blurb}</p> : null}
    </div>
    <div className="rounded-lg border border-subtle bg-surface-1 p-6">{children}</div>
  </section>
);

const Row: React.FC<{ label: string; children: React.ReactNode; note?: string }> = ({ label, children, note }) => (
  <div className="grid grid-cols-[10rem_1fr] items-start gap-4 border-b border-subtle py-3 last:border-b-0">
    <div className="pt-1">
      <code className="text-12 text-primary">{label}</code>
      {note ? <p className="mt-1 text-11 text-tertiary">{note}</p> : null}
    </div>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </div>
);

const Verdict: React.FC<{ ok?: boolean; title: string; children: React.ReactNode }> = ({ ok, title, children }) => (
  <div
    className={`rounded-lg border p-4 ${ok ? "border-success-subtle bg-layer-1" : "border-danger-subtle bg-layer-1"}`}
  >
    <h4 className={`mb-2 text-13 font-semibold ${ok ? "text-primary" : "text-danger-primary"}`}>
      {ok ? "✅ Do" : "🚫 Don't"} — {title}
    </h4>
    <div className="space-y-3 text-13 text-secondary">{children}</div>
  </div>
);

const Snippet: React.FC<{ children: string }> = ({ children }) => (
  <pre className="overflow-x-auto rounded-md border border-subtle bg-layer-1 p-3 text-11 text-secondary">
    <code>{children}</code>
  </pre>
);

const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 5v14m-7-7h14" strokeLinecap="round" />
  </svg>
);

const VARIANTS: TButtonVariant[] = [
  "primary",
  "secondary",
  "tertiary",
  "ghost",
  "error-fill",
  "error-outline",
  "link",
  "link-accent",
];

const SIZES: TButtonSize[] = ["sm", "base", "lg", "xl"];

/* -----------------------------------------------------------------------------
   Stories
   ---------------------------------------------------------------------------*/

export const WhichComponent: Story = {
  name: "1. Which component do I reach for?",
  render: () => (
    <Page>
      <Section
        title="The decision table"
        blurb="Start here. Most inconsistency in the app comes from skipping this step and hand-rolling a <button>."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-subtle text-left text-12 text-tertiary">
                <th className="py-2 pr-4 font-medium">The affordance</th>
                <th className="py-2 pr-4 font-medium">Use</th>
                <th className="py-2 font-medium">Example</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {[
                ["Text label, maybe an icon", "<Button>", "Save · Create project · Cancel"],
                ["Bare glyph, square target", "<IconButton>", "⋯ overflow · × close · ✎ edit"],
                ["Opens a menu", "<Button> / <IconButton> as the trigger", "Sort by ▾"],
                ["Navigates somewhere", "<Link> styled with getButtonStyling()", "“View all docs”"],
                ["Inline in a sentence", '<Button variant="link">', "“Read the docs”"],
                ["Toggles a boolean", "<Switch> (not a button)", "Enable notifications"],
                ["Row in a list you can click", "Bespoke — but copy the recipe below", "Doc row · task row"],
              ].map(([a, b, c]) => (
                <tr key={a} className="border-b border-subtle last:border-b-0">
                  <td className="py-2 pr-4">{a}</td>
                  <td className="py-2 pr-4">
                    <code className="text-12 text-primary">{b}</code>
                  </td>
                  <td className="py-2 text-tertiary">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Import paths">
        <Snippet>{`import { Button, getButtonStyling } from "@dragonfruit/propel/button";
import { IconButton } from "@dragonfruit/propel/icon-button";`}</Snippet>
        <p className="mt-3 text-12 text-tertiary">
          These are the only two button primitives in the monorepo. <code>@dragonfruit/ui</code> used to ship a second,
          legacy <code>Button</code> with a different variant vocabulary (<code>neutral-primary</code>,{" "}
          <code>accent-danger</code>, …); it was deleted so there is exactly one implementation and one import path.
          If you find button classes being reproduced by hand anywhere, that is the bug.
        </p>
      </Section>
    </Page>
  ),
};

export const Variants: Story = {
  name: "2. Variants and what they mean",
  render: () => (
    <Page>
      <Section
        title="Semantic meaning"
        blurb="Variant encodes intent, not appearance. Pick by what the action means; the look follows."
      >
        <Row label="primary" note="One per view.">
          <Button variant="primary">Create project</Button>
          <span className="text-12 text-tertiary">
            The single action this screen exists for. Two primaries on one screen means neither is primary.
          </span>
        </Row>
        <Row label="secondary" note="The default.">
          <Button variant="secondary">Cancel</Button>
          <span className="text-12 text-tertiary">
            Bordered and raised. Real but non-committal actions — the workhorse.
          </span>
        </Row>
        <Row label="tertiary" note="Filled, borderless.">
          <Button variant="tertiary">Filter</Button>
          <span className="text-12 text-tertiary">Sits on a busy surface where a border would add noise.</span>
        </Row>
        <Row label="ghost" note="Toolbars.">
          <Button variant="ghost">Duplicate</Button>
          <span className="text-12 text-tertiary">
            No chrome until hovered. For dense clusters where borders would fight.
          </span>
        </Row>
        <Row label="error-fill" note="Destructive + confirmed.">
          <Button variant="error-fill">Delete forever</Button>
          <span className="text-12 text-tertiary">The confirm button inside a destructive modal. Rarely elsewhere.</span>
        </Row>
        <Row label="error-outline" note="Destructive, in place.">
          <Button variant="error-outline">Remove member</Button>
          <span className="text-12 text-tertiary">Destructive action that still needs a confirmation step after it.</span>
        </Row>
        <Row label="link" note="Underlined.">
          <Button variant="link">Read the docs</Button>
          <span className="text-12 text-tertiary">Inline within prose. Zero horizontal padding by design.</span>
        </Row>
        <Row label="link-accent" note="Brand-coloured.">
          <Button variant="link-accent">Upgrade plan</Button>
          <span className="text-12 text-tertiary">A link that should pull the eye. Not for body copy.</span>
        </Row>
      </Section>

      <Section title="Side by side">
        <div className="flex flex-wrap gap-3">
          {VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </div>
      </Section>
    </Page>
  ),
};

export const Sizes: Story = {
  name: "3. Size scale",
  render: () => (
    <Page>
      <Section
        title="Four sizes, fixed heights"
        blurb="Height is fixed per size so buttons align on a row without ad-hoc padding. Never override height or padding via className — if a size doesn't fit, the size scale is wrong and should change here."
      >
        {SIZES.map((s) => (
          <Row key={s} label={s} note={{ sm: "20px", base: "24px", lg: "28px", xl: "32px" }[s]}>
            <Button size={s} variant="secondary">
              Label
            </Button>
            <Button size={s} variant="secondary" prependIcon={<PlusIcon />}>
              With icon
            </Button>
            <IconButton size={s} variant="secondary" icon={PlusIcon} aria-label={`Add (${s})`} />
          </Row>
        ))}
      </Section>

      <Section title="Hit targets">
        <div className="grid gap-4 md:grid-cols-2">
          <Verdict ok title="Give small controls room">
            <p>
              <code>sm</code> (20px) and <code>base</code> (24px) are below the 24×24 CSS-pixel minimum that WCAG 2.5.8
              asks for. They are fine when the control has spacing around it, but for a standalone tap target on a
              touch surface reach for <code>lg</code> or <code>xl</code>.
            </p>
          </Verdict>
          <Verdict title="Pad the label instead of the button">
            <Snippet>{`<Button size="base" className="h-8 px-4">`}</Snippet>
            <p>
              This desynchronises the button from every other button on the row. Use <code>size="xl"</code>.
            </p>
          </Verdict>
        </div>
      </Section>
    </Page>
  ),
};

export const States: Story = {
  name: "4. States",
  render: () => (
    <Page>
      <Section
        title="Every state is handled for you"
        blurb="Hover, active, focus, disabled and loading all ship with the component. You never write these by hand."
      >
        <Row label="default">
          <Button variant="secondary">Save</Button>
        </Row>
        <Row label="hover / active" note="Automatic.">
          <Button variant="secondary">Hover me</Button>
          <span className="text-12 text-tertiary">
            <code>t-press</code> adds the scale-down on press. Link variants opt out — inline text shouldn't scale.
          </span>
        </Row>
        <Row label="focus-visible" note="Tab to it.">
          <Button variant="secondary">Focus me with Tab</Button>
          <span className="text-12 text-tertiary">
            <code>t-focus</code> paints a 2px accent outline, keyboard-only. Clicking never leaves a ring behind.
          </span>
        </Row>
        <Row label="disabled">
          <Button variant="primary" disabled>
            Primary
          </Button>
          <Button variant="secondary" disabled>
            Secondary
          </Button>
          <Button variant="error-fill" disabled>
            Destructive
          </Button>
        </Row>
        <Row label="loading" note="Implies disabled.">
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button variant="secondary" loading prependIcon={<PlusIcon />}>
            Creating
          </Button>
          <IconButton variant="secondary" loading icon={PlusIcon} aria-label="Saving" />
          <span className="text-12 text-tertiary">
            The spinner takes the prepend slot so the label holds its place and the row doesn't reflow.
          </span>
        </Row>
      </Section>

      <Section title="Focus is not optional">
        <div className="grid gap-4 md:grid-cols-2">
          <Verdict ok title="Let the component own focus">
            <Snippet>{`<Button variant="ghost">Rename</Button>`}</Snippet>
            <p>
              <code>t-focus</code> is in the base class. Keyboard users get an outline on every button for free.
            </p>
          </Verdict>
          <Verdict title="Strip the outline">
            <Snippet>{`<button className="outline-none focus:outline-none">`}</Snippet>
            <p>
              Removing the indicator without replacing it fails WCAG 2.4.7 and makes the app unusable by keyboard. If
              you must hand-roll a button, add <code>t-focus</code>.
            </p>
          </Verdict>
        </div>
      </Section>
    </Page>
  ),
};

export const IconButtons: Story = {
  name: "5. Icon buttons",
  render: () => (
    <Page>
      <Section
        title="A glyph in a square target"
        blurb="This is the single most hand-rolled pattern in the app. IconButton already does it — variants, sizing, press feedback, focus and loading included."
      >
        <Row label="variants">
          {(["primary", "secondary", "tertiary", "ghost", "error-fill", "error-outline"] as const).map((v) => (
            <IconButton key={v} variant={v} icon={PlusIcon} aria-label={v} />
          ))}
        </Row>
        <Row label="sizes" note="20 / 24 / 28 / 32px">
          {SIZES.map((s) => (
            <IconButton key={s} size={s} variant="ghost" icon={PlusIcon} aria-label={`Add ${s}`} />
          ))}
        </Row>
      </Section>

      <Section title="An icon button must be labelled">
        <div className="grid gap-4 md:grid-cols-2">
          <Verdict ok title="Name the action">
            <Snippet>{`<IconButton
  variant="ghost"
  icon={MoreIcon}
  aria-label="More actions"
/>`}</Snippet>
            <p>There is no text for a screen reader to announce, so the label has to come from you.</p>
          </Verdict>
          <Verdict title="Ship a nameless glyph">
            <Snippet>{`<button className="grid size-6 place-items-center">
  <MoreIcon />
</button>`}</Snippet>
            <p>
              Announced as just “button”. This is the shape of the majority of hand-rolled icon buttons in the app
              today.
            </p>
          </Verdict>
        </div>
      </Section>

      <Section
        title="Migration recipe"
        blurb="The ad-hoc icon button in this codebase almost always looks like the left column. It maps cleanly onto ghost."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-12 text-tertiary">Found in the wild</p>
            <Snippet>{`<button
  type="button"
  className="grid size-6 place-items-center
             rounded-lg text-tertiary
             transition-colors
             hover:bg-layer-1 hover:text-primary"
  onClick={onEdit}
>
  <EditIcon className="size-4" />
</button>`}</Snippet>
          </div>
          <div>
            <p className="mb-2 text-12 text-tertiary">Replacement</p>
            <Snippet>{`<IconButton
  variant="ghost"
  size="base"
  icon={EditIcon}
  aria-label="Edit"
  onClick={onEdit}
/>`}</Snippet>
            <p className="mt-3 text-12 text-tertiary">
              Gains a focus ring, press feedback, a disabled state, a loading state and an accessible name.
            </p>
          </div>
        </div>
      </Section>
    </Page>
  ),
};

export const LinksAndTriggers: Story = {
  name: "6. Links and dropdown triggers",
  render: () => (
    <Page>
      <Section
        title="When the element can't be a <button>"
        blurb="Navigation needs an <a>. A dropdown trigger is often supplied by a headless library. Both should still look like buttons — that's what getButtonStyling() is for."
      >
        <Snippet>{`import { getButtonStyling } from "@dragonfruit/propel/button";

<Link href={href} className={getButtonStyling("secondary", "lg")}>
  View all docs
</Link>

<Popover.Button className={cn(getButtonStyling("secondary", "base"), "px-2")}>
  Sort by
</Popover.Button>`}</Snippet>
        <p className="mt-3 text-12 text-tertiary">
          <code>getButtonStyling</code> returns the same class string the component uses, so a styled link and a real
          button stay identical forever. Never re-derive button classes by hand.
        </p>
      </Section>

      <Section title="Navigation is not a button">
        <div className="grid gap-4 md:grid-cols-2">
          <Verdict ok title="Route with an anchor">
            <Snippet>{`<Link href="/docs" className={getButtonStyling("secondary", "lg")}>`}</Snippet>
            <p>Middle-click, ⌘-click and “copy link address” all work.</p>
          </Verdict>
          <Verdict title="router.push from onClick">
            <Snippet>{`<Button onClick={() => router.push("/docs")}>`}</Snippet>
            <p>Breaks every browser navigation affordance and is announced as a button, not a link.</p>
          </Verdict>
        </div>
      </Section>
    </Page>
  ),
};

export const Hierarchy: Story = {
  name: "7. Hierarchy in practice",
  render: () => (
    <Page>
      <Section
        title="One primary per view — including inside lists"
        blurb="Both examples below are real patterns found in this codebase. A row in a repeated list is never the single most important action on the page; if every row shouts, nothing does."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Verdict title="A primary per row">
            <div className="space-y-2">
              {["Slack", "Notion", "Linear"].map((n) => (
                <div
                  key={n}
                  className="flex items-center justify-between rounded-lg border border-subtle bg-layer-2 p-3"
                >
                  <span className="text-13 text-primary">{n}</span>
                  <Button variant="primary" size="sm">
                    Connect
                  </Button>
                </div>
              ))}
            </div>
            <p>Three magenta buttons competing. The eye has nowhere to land.</p>
          </Verdict>
          <Verdict ok title="Rows are secondary">
            <div className="space-y-2">
              {["Slack", "Notion", "Linear"].map((n) => (
                <div
                  key={n}
                  className="flex items-center justify-between rounded-lg border border-subtle bg-layer-2 p-3"
                >
                  <span className="text-13 text-primary">{n}</span>
                  <Button variant="secondary" size="sm">
                    Connect
                  </Button>
                </div>
              ))}
            </div>
            <p>Primary stays available for the page-level action, so it still means something.</p>
          </Verdict>
        </div>
      </Section>

      <Section
        title="Consequence must be visible"
        blurb="Two buttons that look identical should do comparable things. If one destroys work and the other is a no-op, the skin has to say so."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Verdict title="Destroy and dismiss look the same">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-subtle bg-layer-2 p-3">
              <Button variant="secondary" size="sm">
                Discard
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm">
                  Cancel
                </Button>
                <Button variant="primary" size="sm">
                  Save to Drafts
                </Button>
              </div>
            </div>
            <p>
              <strong>Discard</strong> throws away the draft; <strong>Cancel</strong> does nothing. Same button, opposite
              outcome.
            </p>
          </Verdict>
          <Verdict ok title="Destructive reads as destructive">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-subtle bg-layer-2 p-3">
              <Button variant="error-outline" size="sm">
                Discard
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm">
                  Cancel
                </Button>
                <Button variant="primary" size="sm">
                  Save to Drafts
                </Button>
              </div>
            </div>
            <p>Three actions, three distinct weights: destructive, neutral, committing.</p>
          </Verdict>
        </div>
      </Section>
    </Page>
  ),
};

export const Rules: Story = {
  name: "8. Rules",
  render: () => (
    <Page>
      <Section title="The short version" blurb="If you remember nothing else from this page.">
        <ol className="list-decimal space-y-3 pl-5 text-13 text-secondary">
          <li>
            <strong className="text-primary">Reach for the component.</strong> <code>Button</code> for labels,{" "}
            <code>IconButton</code> for glyphs. A raw <code>&lt;button&gt;</code> needs a reason.
          </li>
          <li>
            <strong className="text-primary">One primary per view.</strong> Everything else is secondary or quieter.
          </li>
          <li>
            <strong className="text-primary">Never override height, padding or radius.</strong> Pick a different{" "}
            <code>size</code>. Layout classes like <code>w-full</code> are fine.
          </li>
          <li>
            <strong className="text-primary">Always set <code>type</code>.</strong> A bare{" "}
            <code>&lt;button&gt;</code> inside a form defaults to <code>type="submit"</code>. Both components default
            to <code>"button"</code> for you.
          </li>
          <li>
            <strong className="text-primary">Every icon-only button gets an <code>aria-label</code>.</strong>
          </li>
          <li>
            <strong className="text-primary">Never remove the focus outline.</strong> Hand-rolled buttons must carry{" "}
            <code>t-focus</code>.
          </li>
          <li>
            <strong className="text-primary">Use <code>loading</code> for async work.</strong> It disables the button
            and renders a spinner — don't roll your own.
          </li>
          <li>
            <strong className="text-primary">Style non-buttons with <code>getButtonStyling()</code>,</strong> never by
            copying class strings.
          </li>
        </ol>
      </Section>

      <Section title="Tokens these components rely on">
        <div className="grid gap-3 text-12 md:grid-cols-2">
          {[
            ["t-colors", "Shared colour/box-shadow transition timing."],
            ["t-press", "Scale-down on press. Skipped on link variants."],
            ["t-focus", "The one focus-visible outline for the whole system."],
            ["shadow-raised-100", "The lift under the secondary variant."],
            ["bg-layer-*", "Surface depth ramp used by tertiary and ghost."],
            ["text-body-xs-medium", "Typography scale — never a raw text-13."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-subtle bg-layer-1 p-3">
              <code className="text-12 text-primary">{t}</code>
              <p className="mt-1 text-11 text-tertiary">{d}</p>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};
