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
    <main className="min-h-screen bg-[#f7f6f8] text-[#252534]">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6">
        <a href="/google-oauth" className="text-sm inline-flex items-center gap-2 font-semibold text-[#6f6f7d]">
          <img src={dragonMark} alt="" aria-hidden className="h-8 w-auto" />
          DragonFruit
        </a>
        <nav className="text-sm flex items-center gap-4 font-medium text-[#777685]">
          <a href="/legal/privacy" className="hover:text-[#252534]">
            Privacy
          </a>
          <a href="/legal/terms" className="hover:text-[#252534]">
            Terms
          </a>
          <a href="/" className="hover:text-[#252534]">
            Sign in
          </a>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-4xl px-6 pt-6 pb-16">
        <div className="border-b border-[#dedde4] pb-10">
          {props.eyebrow && <div className="text-sm font-semibold text-[#b0007a]">{props.eyebrow}</div>}
          <h1 className="text-5xl tracking-normal md:text-6xl mt-3 max-w-3xl font-[Newsreader] leading-[1.02] font-medium text-[#20202d]">
            {props.title}
          </h1>
          <p className="text-base mt-5 max-w-2xl leading-7 text-[#666574]">{props.description}</p>
        </div>

        <article className="prose-neutral prose-headings:text-[#292938] prose-p:text-[#535260] prose-a:text-[#b0007a] prose-li:text-[#535260] mt-10 max-w-none prose">
          {props.children}
        </article>
      </section>
    </main>
  );
}
