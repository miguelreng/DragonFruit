/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LegalShell } from "../../legal-shell";

export default function PrivacyPolicyPage() {
  return (
    <LegalShell
      eyebrow="Last updated May 27, 2026"
      title="Privacy Policy"
      description="This policy explains how DragonFruit collects, uses, stores, shares, and protects personal data, including data accessed through Google Sign-In and Google Calendar."
    >
      <h2>Overview</h2>
      <p>
        DragonFruit is a productivity workspace for projects, tasks, docs, meeting notes, stickies, and agents. This
        Privacy Policy applies to DragonFruit's web app, API, and macOS companion app.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          Account information, such as name, email address, profile image, workspace membership, and authentication
          data.
        </li>
        <li>
          Workspace content, such as projects, tasks, docs, drafts, stickies, comments, settings, and agent activity.
        </li>
        <li>Technical information, such as device, browser, IP address, app logs, and diagnostic events.</li>
        <li>Voice note content when you choose to record or dictate notes in the macOS companion app.</li>
      </ul>

      <h2>Google user data</h2>
      <p>
        If you choose to sign in with Google, DragonFruit may access your Google account identifier, email address,
        name, and profile image to create or authenticate your DragonFruit account.
      </p>
      <p>
        If you choose to connect Google Calendar, DragonFruit may access calendar account information and calendar event
        data, including event titles, descriptions, locations, attendees, start and end times, calendar identifiers,
        conferencing links, and related event metadata. DragonFruit uses this data to show upcoming meetings, support
        meeting reminders, create meeting notes, and sync calendar-related work with your DragonFruit workspace.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To provide, secure, maintain, and improve DragonFruit.</li>
        <li>To authenticate users and maintain active sessions.</li>
        <li>To show upcoming meetings and organize meeting-related notes, tasks, docs, and stickies.</li>
        <li>To provide user-facing agent and automation features requested by the user.</li>
        <li>To troubleshoot bugs, prevent abuse, and comply with legal obligations.</li>
      </ul>

      <h2>Google API Services Limited Use</h2>
      <p>
        DragonFruit's use and transfer of information received from Google APIs will adhere to the Google API Services
        User Data Policy, including the Limited Use requirements. DragonFruit does not sell Google user data, does not
        use Google user data for advertising, and does not use Google user data to train general-purpose AI models.
      </p>

      <h2>BYOK and AI providers</h2>
      <p>
        If you connect third-party AI providers using BYOK, DragonFruit may process prompts, outputs, and related
        metadata to provide the feature. Provider-side processing is governed by the provider's own terms and privacy
        policies.
      </p>

      <h2>Open-source license</h2>
      <p>
        DragonFruit includes software licensed under AGPL-3.0. Source code for the running version is available at{" "}
        <a href="https://github.com/miguelreng/DragonFruit" target="_blank" rel="noopener noreferrer">
          github.com/miguelreng/DragonFruit
        </a>
        .
      </p>

      <h2>Sharing</h2>
      <p>
        DragonFruit shares personal data only as needed to provide the service, with infrastructure and processing
        providers, for security and abuse prevention, when required by law, or with your direction and consent.
        DragonFruit does not sell personal data.
      </p>

      <h2>Storage and security</h2>
      <p>
        DragonFruit stores data on secure infrastructure and uses reasonable safeguards designed to protect data in
        transit and at rest. OAuth tokens are stored securely and are used only to provide the connected Google
        features.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        DragonFruit keeps personal data while your account is active or as needed to provide the service. You may
        disconnect Google Calendar from DragonFruit settings. You may also request deletion of your account or connected
        Google data by contacting us.
      </p>

      <h2>Your choices</h2>
      <p>
        You can update profile data, disconnect integrations, rotate API keys, and request account deletion. You are
        responsible for removing any third-party data sources you no longer want connected.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions or deletion requests, contact{" "}
        <a href="mailto:miguelreng@gmail.com">miguelreng@gmail.com</a>.
      </p>
    </LegalShell>
  );
}
