/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { ArrowRight, Check, FileText, GitBranch, ListChecks, Sparkle } from "@phosphor-icons/react";
// components
import { AuthBase } from "@/components/auth-screens/auth-base";
import { PageHead } from "@/components/core/page-title";
// helpers
import { EAuthModes, EPageTypes } from "@/helpers/authentication.helper";
// layouts
import DefaultLayout from "@/layouts/default-layout";
// wrappers
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";
// assets
import dragonMark from "@/app/assets/branding/dragon.svg?url";

const APP_URL = "https://app.dragonfruit.sh";
const APP_HOSTNAME = "app.dragonfruit.sh";

const navGroups = [
  {
    title: "About",
    items: ["What we built", "The imprenta moment", "The new generalists", "Why this tool exists"],
  },
  {
    title: "How it works",
    items: ["Think in public", "Turn ideas into tasks", "Work across disciplines", "Ship from the page"],
  },
  {
    title: "Built for teams",
    items: ["Open by default", "Self-hosted or hosted", "Built on Plane"],
  },
  {
    title: "Get started",
    items: ["Open the app", "Read the pitch", "Bring your workspace"],
  },
];

const queuedWork = [
  {
    icon: "N",
    title: "Shape a new product idea",
    meta: "Notes - becoming a spec",
    tone: "bg-brand-100 text-accent-primary",
  },
  {
    icon: "M",
    title: "Map the market argument",
    meta: "Research - open questions",
    tone: "bg-amber-100 text-warning-primary",
  },
  {
    icon: "B",
    title: "Break the build into tasks",
    meta: "Project - 6 drafts",
    tone: "bg-green-100 text-success-primary",
  },
  { icon: "D", title: "Design the workflow", meta: "Docs - live links", tone: "bg-indigo-50 text-[#3157C9]" },
  { icon: "R", title: "Review customer risks", meta: "Spec section - assigned", tone: "bg-pink-50 text-[#B72961]" },
];

const shippedActivity = [
  "Turned raw thinking into a structured plan",
  "Created 6 tasks from the first version of the argument",
  "Linked research, design, and implementation in one doc",
  "Kept the project moving without changing rooms",
];

const featureSections = [
  {
    id: "the-imprenta-moment",
    eyebrow: "The imprenta moment",
    title: "The printing press made knowledge movable. AI is doing it again.",
    body: [
      "Before the imprenta, work and knowledge mostly traveled through families, guilds, and closed rooms. A profession was often inherited before it was chosen. The press did not make everyone an expert overnight, but it broke the monopoly on access.",
      "Books made it possible for a person to read outside their station, combine fields, and become something new: a generalist with enough reach to cross borders that used to be guarded by lineage.",
    ],
  },
  {
    id: "the-new-generalists",
    eyebrow: "The new generalists",
    title: "AI is turning ambition into a craft you can practice across disciplines.",
    body: [
      "The same kind of opening is happening now. AI lets one person move between product thinking, writing, design, research, code, operations, and strategy with a fluency that used to require a department.",
      "That does not make craft disappear. It makes craft more reachable. The new bottleneck is not whether you can access knowledge. It is whether you have a place to turn your thinking into real work.",
    ],
  },
  {
    id: "why-this-tool-exists",
    eyebrow: "Why this tool exists",
    title: "Dragon Fruit is made for people building outside one inherited lane.",
    body: [
      "It is for people like you: the founder, builder, designer, operator, researcher, and writer living in the same body. The person who wants to follow an idea from first note to shipped artifact without slicing themselves into job titles.",
      "Dragon Fruit gives that generalist a workspace where docs and tasks are the same canvas. Think, write, ask AI, shape the spec, create the work, and keep moving.",
    ],
  },
];

const capabilities = [
  {
    icon: FileText,
    title: "Think in public",
    text: "Give early ideas a calm place to become arguments, specs, research notes, and decisions.",
  },
  {
    icon: ListChecks,
    title: "Turn ideas into tasks",
    text: "Promote action items from the page into live project work without losing the original reasoning.",
  },
  {
    icon: Sparkle,
    title: "Use AI as leverage",
    text: "Turn transcripts, rough notes, and questions into useful structure while you stay in control of the craft.",
  },
  {
    icon: GitBranch,
    title: "Work across disciplines",
    text: "Keep product, writing, design, and implementation connected instead of scattered across tools.",
  },
];

function HomePage() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  if (hostname === APP_HOSTNAME) {
    return (
      <>
        <PageHead title="Sign in to Dragon Fruit" />
        <DefaultLayout>
          <AuthenticationWrapper pageType={EPageTypes.NON_AUTHENTICATED}>
            <AuthBase authType={EAuthModes.SIGN_IN} />
          </AuthenticationWrapper>
        </DefaultLayout>
      </>
    );
  }

  return (
    <>
      <PageHead title="Dragon Fruit - The workspace for the new generalists" />
      <div className="h-screen w-screen overflow-y-auto bg-canvas text-primary">
        <header className="sticky top-0 z-30 border-b border-subtle bg-surface-1/90 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 sm:px-8">
            <a href="/" className="text-15 flex items-center gap-3 font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-md border border-subtle bg-layer-2">
                <img src={dragonMark} alt="" className="h-5 w-5" />
              </span>
              Dragon Fruit
            </a>
            <nav className="hidden items-center gap-7 text-13 font-medium text-secondary md:flex">
              <a href="#what-we-built" className="hover:text-primary">
                Story
              </a>
              <a href="#how-it-works" className="hover:text-primary">
                How it works
              </a>
              <a href="#built-for-teams" className="hover:text-primary">
                Built for teams
              </a>
            </nav>
            <a
              href={APP_URL}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-inverse px-4 text-13 font-semibold text-inverse transition hover:opacity-90"
            >
              Open app
              <ArrowRight size={14} weight="bold" />
            </a>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:py-16">
          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-9">
              {navGroups.map((group, groupIndex) => (
                <div key={group.title} className="space-y-4">
                  <p className="text-13 font-semibold text-primary">{group.title}</p>
                  <div className="space-y-3">
                    {group.items.map((item, itemIndex) => (
                      <a
                        key={item}
                        href={`#${item.toLowerCase().replaceAll(" ", "-")}`}
                        className="flex items-center gap-3 text-13 text-tertiary transition hover:text-primary"
                      >
                        {groupIndex === 0 && itemIndex === 0 ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
                        ) : (
                          <span className="h-1.5 w-1.5" />
                        )}
                        {item}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="min-w-0">
            <section id="what-we-built" className="grid gap-10 pt-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)]">
              <div className="max-w-[720px]">
                <p className="mb-6 inline-flex rounded-md border border-accent-subtle bg-accent-subtle px-3 py-1 text-12 font-semibold text-accent-primary">
                  For the first AI-native generalists.
                </p>
                <h1 className="tracking-normal max-w-[660px] text-[44px] leading-[1.02] font-semibold text-primary sm:text-[58px]">
                  The new generalists need a workshop.
                </h1>
                <p className="text-17 mt-7 max-w-[680px] leading-8 text-secondary sm:text-18">
                  The imprenta made knowledge portable and let people learn beyond the profession they inherited. AI is
                  opening the same door again. Dragon Fruit is a workspace for people who want to think, write, build,
                  and ship across disciplines.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a
                    href={APP_URL}
                    className="inline-flex h-11 items-center gap-2 rounded-md bg-accent-primary px-5 text-14 font-semibold text-on-color transition hover:bg-accent-primary-hover"
                  >
                    Open Dragon Fruit
                    <ArrowRight size={16} weight="bold" />
                  </a>
                  <a
                    href="#the-imprenta-moment"
                    className="inline-flex h-11 items-center gap-2 rounded-md px-4 text-14 font-semibold text-secondary transition hover:bg-layer-2 hover:text-primary"
                  >
                    Start reading
                    <ArrowRight size={16} />
                  </a>
                </div>
              </div>

              <div className="shadow-sm relative min-h-[380px] overflow-hidden rounded-lg border border-subtle bg-surface-1 p-4">
                <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,var(--bg-accent-subtle),transparent)]" />
                <div className="relative rounded-md border border-subtle bg-layer-2 p-4">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-10 font-semibold tracking-[0.16em] text-tertiary uppercase">Live spec</p>
                      <h2 className="mt-1 text-16 font-semibold">Generalist build note</h2>
                    </div>
                    <span className="rounded-md bg-success-subtle px-2.5 py-1 text-11 font-semibold text-success-primary">
                      Synced
                    </span>
                  </div>
                  <div className="space-y-3">
                    <p className="rounded-md bg-surface-1 px-3 py-2 text-13 leading-6 text-secondary">
                      Thesis: AI does not replace craft. It lets more people cross the walls around craft.
                    </p>
                    {queuedWork.slice(0, 3).map((item) => (
                      <div
                        key={item.title}
                        className="flex items-center gap-3 rounded-md border border-subtle bg-surface-1 p-3"
                      >
                        <span className={`grid h-7 w-7 place-items-center rounded text-11 font-bold ${item.tone}`}>
                          {item.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-13 font-semibold">{item.title}</p>
                          <p className="truncate text-12 text-tertiary">{item.meta}</p>
                        </div>
                        <Check size={16} weight="bold" className="text-accent-primary" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-20 space-y-8">
              {featureSections.map((section) => (
                <article key={section.id} id={section.id} className="max-w-[980px] scroll-mt-28">
                  <p className="text-14 font-semibold text-primary">{section.eyebrow}</p>
                  <h2 className="mt-4 max-w-[760px] text-28 leading-tight font-semibold text-primary sm:text-32">
                    {section.title}
                  </h2>
                  <div className="mt-7 space-y-5 text-16 leading-8 text-secondary">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </article>
              ))}
            </section>

            <section
              id="how-it-works"
              className="shadow-sm mt-16 overflow-hidden rounded-lg border border-subtle bg-surface-1 p-5 sm:p-8"
            >
              <div className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-md border border-subtle bg-layer-2 p-5">
                  <p className="mb-5 text-10 font-semibold tracking-[0.16em] text-tertiary uppercase">
                    Old world - split workflow
                  </p>
                  <div className="space-y-3">
                    {queuedWork.map((item) => (
                      <div key={item.title} className="flex items-center gap-3">
                        <span className={`grid h-7 w-7 place-items-center rounded text-11 font-bold ${item.tone}`}>
                          {item.icon}
                        </span>
                        <div>
                          <p className="text-14 font-medium">{item.title}</p>
                          <p className="text-12 text-tertiary">{item.meta}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 flex items-center justify-between border-t border-subtle pt-4 text-12">
                    <span className="font-semibold text-secondary">2h 42m spent translating</span>
                    <span className="text-tertiary">5 still queued</span>
                  </div>
                </div>

                <div className="rounded-md border border-subtle bg-layer-2 p-5">
                  <p className="mb-5 text-10 font-semibold tracking-[0.16em] text-tertiary uppercase">
                    With Dragon Fruit
                  </p>
                  <div className="mb-5 flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-accent-primary text-11 font-bold text-on-color">
                      D
                    </span>
                    <p className="rounded-md bg-surface-1 px-3 py-2 text-13 leading-6 text-secondary">
                      Done. The idea has a thesis, a plan, and live tasks your future self can actually follow.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {["Docs", "Tasks", "Projects", "Comments", "AI draft", "Roadmap"].map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-surface-1 px-3 py-2 text-12 font-medium text-secondary"
                      >
                        <Check size={13} weight="bold" className="text-accent-primary" />
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="mt-6 space-y-2">
                    {shippedActivity.map((item, index) => (
                      <p key={item} className="text-12 text-tertiary">
                        {["9:14", "9:16", "9:17", "9:18"][index]} <span className="ml-3 text-secondary">{item}</span>
                      </p>
                    ))}
                  </div>
                  <div className="mt-8 flex items-center justify-between border-t border-subtle pt-4 text-12">
                    <span className="font-semibold text-accent-primary">18 min - 9x faster</span>
                    <span className="text-tertiary">6 shipped</span>
                  </div>
                </div>
              </div>
            </section>

            <section id="built-for-teams" className="mt-20">
              <div className="mb-8 max-w-[760px]">
                <p className="text-14 font-semibold text-primary">Built for teams</p>
                <h2 className="text-30 mt-4 leading-tight font-semibold text-primary">
                  A workshop for the person who refuses to stay in one lane.
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {capabilities.map((capability) => {
                  const Icon = capability.icon;
                  return (
                    <article key={capability.title} className="rounded-lg border border-subtle bg-surface-1 p-5">
                      <Icon size={24} weight="duotone" className="text-accent-primary" />
                      <h3 className="mt-5 text-16 font-semibold">{capability.title}</h3>
                      <p className="mt-3 text-14 leading-6 text-secondary">{capability.text}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}

export default HomePage;
