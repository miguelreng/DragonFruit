/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { AuthBase } from "@/components/auth-screens/auth-base";
import { PageHead } from "@/components/core/page-title";
// helpers
import { EAuthModes, EPageTypes } from "@/helpers/authentication.helper";
// layouts
import DefaultLayout from "@/layouts/default-layout";
// wrappers
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";

const APP_URL = "https://app.dragonfruit.sh";
const APP_HOSTNAME = "app.dragonfruit.sh";

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
      <PageHead title="Dragon Fruit" />
      <div className="h-screen w-screen overflow-y-auto bg-white text-[#111]">
        <main className="mx-auto max-w-[680px] px-6 py-12 sm:py-20">
          <header className="mb-16">
            <p className="mb-3 text-14">Dragon Fruit</p>
            <h1 className="font-normal tracking-normal text-[40px] leading-tight sm:text-[56px]">
              A small workspace for the new generalists.
            </h1>
          </header>

          <section className="mb-16 space-y-6 text-18 leading-8">
            <h2 className="font-normal text-18">The imprenta thing</h2>
            <p>
              Before the printing press, knowledge moved slowly. It lived in rooms, guilds, monasteries, families, and
              professions you were usually born near before you ever got to choose them.
            </p>
            <p>
              Then books started moving. Not all at once, and not equally, but enough. A person could read outside their
              assigned lane. A carpenter could become an astronomer. A clerk could become a political thinker. A curious
              person could become harder to contain.
            </p>
            <p>
              AI feels like another one of those openings. It does not make craft cheap. It makes more doors reachable.
              The person who can think clearly, ask well, and keep going can cross disciplines without waiting for a
              whole institution to give permission.
            </p>
            <p>Dragon Fruit is for that person.</p>
          </section>

          <section className="mb-16">
            <h2 className="font-normal mb-6 text-18">Manifesto</h2>
            <ul className="list-disc space-y-4 pl-5 text-18 leading-8">
              <li>Work should begin as thinking, not as tickets.</li>
              <li>Documents and tasks belong in the same room.</li>
              <li>The best builders are allowed to be writers, researchers, designers, operators, and engineers.</li>
              <li>AI is useful when it helps you make the next honest thing.</li>
              <li>A workspace should be quiet enough for a thought to survive.</li>
              <li>Open tools matter because serious work should not require permission from a pricing page.</li>
              <li>The future belongs to people who can move between fields and still finish.</li>
            </ul>
          </section>

          <footer className="pb-12 text-18">
            <a href={APP_URL} className="underline underline-offset-4">
              Open the app
            </a>
          </footer>
        </main>
      </div>
    </>
  );
}

export default HomePage;
