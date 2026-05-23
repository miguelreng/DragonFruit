/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LegalShell } from "../legal-shell";

export default function GoogleOAuthPage() {
  return (
    <LegalShell
      eyebrow="Google OAuth app"
      title="DragonFruit connects your calendar to your work."
      description="DragonFruit is a workspace for projects, tasks, docs, meeting notes, stickies, and lightweight agents. The Google integration helps users bring upcoming meetings into DragonFruit and turn meeting context into organized work."
    >
      <h2>What DragonFruit does</h2>
      <p>
        DragonFruit helps individuals and teams capture ideas, organize projects, track tasks, write docs, and manage
        meeting follow-ups. The macOS Copilot companion can show upcoming meetings and help users turn voice notes into
        tasks, docs, or stickies in their DragonFruit workspace.
      </p>

      <h2>How Google is used</h2>
      <p>
        Users may sign in with Google and may optionally connect Google Calendar. Calendar access is used to show
        upcoming meetings, support meeting reminders, and sync calendar-related work into DragonFruit.
      </p>

      <h2>Public policy links</h2>
      <p>
        Review DragonFruit's <a href="/legal/privacy">Privacy Policy</a> and <a href="/legal/terms">Terms of Service</a>
        . These pages explain what data DragonFruit accesses, how it is used, how it is shared, and how users can
        request deletion.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about DragonFruit or its Google integration can be sent to{" "}
        <a href="mailto:miguelreng@gmail.com">miguelreng@gmail.com</a>.
      </p>
    </LegalShell>
  );
}
