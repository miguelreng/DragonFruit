/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LegalShell } from "../../legal-shell";

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Last updated May 27, 2026"
      title="Terms of Service"
      description="These terms describe the basic rules for using DragonFruit and its connected services."
    >
      <h2>Using DragonFruit</h2>
      <p>
        DragonFruit provides tools for organizing projects, tasks, docs, meeting notes, stickies, calendar context, and
        agent-assisted work. You are responsible for the content you add to DragonFruit and for using the service in a
        lawful way.
      </p>

      <h2>Accounts and access</h2>
      <p>
        You must keep your account credentials secure. If you use Google Sign-In or connect Google Calendar, you
        authorize DragonFruit to access the Google data described in the Privacy Policy for the features you enable.
      </p>

      <h2>Workspace content</h2>
      <p>
        You retain ownership of your workspace content. DragonFruit may process that content to provide the features you
        request, including organization, search, calendar sync, voice-note capture, docs, tasks, and agent workflows.
      </p>

      <h2>Acceptable use</h2>
      <p>
        You may not use DragonFruit to break the law, abuse the service, attempt unauthorized access, interfere with
        other users, or upload content that you do not have the right to use.
      </p>

      <h2>Third-party services</h2>
      <p>
        DragonFruit may integrate with third-party services such as Google. Your use of those services is also governed
        by their terms and policies.
      </p>

      <h2>Atlas and BYOK</h2>
      <p>
        DragonFruit may provide AI and Atlas features. Where bring-your-own-key (BYOK) is enabled, you are responsible
        for the API keys and provider accounts you connect, including compliance with provider terms, usage limits, and
        billing.
      </p>

      <h2>Paid features</h2>
      <p>
        Some DragonFruit features may require a paid plan. Pricing, billing intervals, and feature limits may change as
        the product evolves. Continued use of paid features after a pricing update means you accept the updated pricing.
      </p>

      <h2>Service changes</h2>
      <p>
        DragonFruit may change, suspend, or discontinue parts of the service as the product evolves. We will try to make
        reasonable efforts to avoid disrupting active users.
      </p>

      <h2>Disclaimers</h2>
      <p>
        DragonFruit is provided as-is and as available. To the fullest extent permitted by law, DragonFruit disclaims
        warranties of merchantability, fitness for a particular purpose, and non-infringement.
      </p>

      <h2>Open-source license</h2>
      <p>
        DragonFruit includes software licensed under AGPL-3.0. Source code for the running version is available at{" "}
        <a href="https://github.com/miguelreng/DragonFruit" target="_blank" rel="noopener noreferrer">
          github.com/miguelreng/DragonFruit
        </a>
        .
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can be sent to <a href="mailto:miguelreng@gmail.com">miguelreng@gmail.com</a>.
      </p>
    </LegalShell>
  );
}
