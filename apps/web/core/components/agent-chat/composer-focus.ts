/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Bridges "Atlas just became visible" (WorkspaceContentWrapper owns that
 * state) to the chat composer, which may mount a beat later — on a first
 * open the sessions fetch has to resolve before the thread (and its
 * textarea) exists. Mirrors the pending-reply-context pattern: the wrapper
 * requests focus, whichever composer mounts next consumes it.
 */
let pendingFocus = false;

export const requestAtlasComposerFocus = () => {
  pendingFocus = true;
};

/** Returns whether focus was pending, and clears the flag either way. */
export const consumeAtlasComposerFocus = (): boolean => {
  const wasPending = pendingFocus;
  pendingFocus = false;
  return wasPending;
};
