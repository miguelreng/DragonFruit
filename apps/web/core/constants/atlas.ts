/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Single source of truth for Atlas's product identity.
 *
 * Atlas is one canonical companion across every workspace — its name,
 * personality, and brand mark are owned here in code, not editable per
 * workspace. The only thing that legitimately varies per workspace is the
 * model + BYOK key, which lives on the Settings → AI page.
 *
 * Display surfaces should read these constants instead of the agent's
 * stored `name` / `description` / `avatar_url` so the identity can never
 * drift between workspaces. The matching server-side personality lives in
 * `apps/api/plane/bgtasks/agent_dispatch_task.py` and `.../agent/chat.py`.
 */
export const ATLAS_IDENTITY = {
  name: "Atlas",
  description:
    "Your sharp, proactive workspace companion — concise, honest, a little dry humor. Asks the right questions, resolves problems, gets out of your way.",
  /** Self-contained brand mark (magenta square + white dragon) served from /public. */
  avatarSrc: "/atlas-mark.svg",
} as const;
