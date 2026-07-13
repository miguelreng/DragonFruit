/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import dragonMark from "@/app/assets/branding/dragon.svg?url";
import type { ReactNode } from "react";

type LegalShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
};

export function LegalShell(props: LegalShellProps) {
  return (
    <main className="min-h-screen bg-white text-[#111111]">
      <div className="mx-auto flex w-full max-w-[920px] flex-col px-5 py-6 sm:px-8 sm:py-8">
        <header className="mb-7 flex flex-wrap items-center gap-3">
          <a
            href="/"
            aria-label="DragonFruit home"
            className="inline-flex items-center gap-2 text-[13px] leading-none text-[#3f3f3f] no-underline"
          >
            <img src={dragonMark} alt="" aria-hidden className="h-8 w-auto" />
            <span className="font-normal font-['Figtree_Variable'] text-[19px] tracking-tight text-[#111111]">
              DragonFruit
            </span>
          </a>

          <nav className="ml-auto inline-flex flex-wrap items-center gap-3" aria-label="Public links">
            <a
              href="/google-oauth"
              className="text-[13px] leading-none text-[#3f3f3f] underline-offset-4 hover:underline"
            >
              OAuth
            </a>
            <a
              href="/legal/privacy"
              className="text-[13px] leading-none text-[#3f3f3f] underline-offset-4 hover:underline"
            >
              Privacy
            </a>
            <a
              href="/legal/terms"
              className="text-[13px] leading-none text-[#3f3f3f] underline-offset-4 hover:underline"
            >
              Terms
            </a>
            <a
              href="https://github.com/miguelreng/DragonFruit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] leading-none text-[#3f3f3f] underline-offset-4 hover:underline"
            >
              Source
            </a>
          </nav>
        </header>

        <section className="border-b border-[#dedbd5] pb-8">
          {props.eyebrow && (
            <div className="font-['Figtree_Variable'] text-[13px] leading-tight font-medium text-[#aa0276]">
              {props.eyebrow}
            </div>
          )}
          <h1 className="font-normal mt-2 max-w-3xl font-['Figtree_Variable'] text-[clamp(28px,5.5vw,58px)] leading-[1.03] tracking-tight text-[#111111]">
            {props.title}
          </h1>
          <p className="mt-4 max-w-3xl font-['Sorts_Mill_Goudy'] text-[17px] leading-[1.55] text-[#3f3f3f]">
            {props.description}
          </p>
        </section>

        <article className="[&_h2]:text-sm [&_h2]:font-normal mt-8 max-w-none font-['Sorts_Mill_Goudy'] text-[#3f3f3f] [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:font-['Figtree_Variable'] [&_h2]:leading-[1.35] [&_h2]:text-[#575757] [&_li]:mb-[5px] [&_li]:text-[15px] [&_li]:leading-[1.5] [&_li]:text-[#3f3f3f] [&_p]:mb-3.5 [&_p]:text-[15px] [&_p]:leading-[1.5] [&_p]:text-[#3f3f3f] [&_ul]:m-0 [&_ul]:pl-5">
          {props.children}
        </article>

        <footer className="mt-10 pb-4 font-['Figtree_Variable'] text-[11px] leading-[1.2] text-[#8e8e8e]">
          <div className="flex flex-wrap items-center gap-3">
            <a href="/legal/privacy" className="underline underline-offset-2">
              Privacy Policy
            </a>
            <a href="/legal/terms" className="underline underline-offset-2">
              Terms and Conditions
            </a>
            <a
              href="https://github.com/miguelreng/DragonFruit"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Source Code (AGPL-3.0)
            </a>
            <span>{`© ${new Date().getFullYear()} DragonFruit`}</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
