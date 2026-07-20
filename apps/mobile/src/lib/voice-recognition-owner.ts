/**
 * expo-speech-recognition exposes ONE global native recognition session:
 * `useSpeechRecognitionEvent` fires for every mounted listener regardless of
 * who started it, and `ExpoSpeechRecognitionModule.stop()`/`abort()` acts on
 * whatever session happens to be active. `VoiceCapture` (mounted permanently
 * under the workspace hub) and Atlas chat's composer mic can both be mounted
 * at the same time, so without coordination one screen starting a recording
 * fires "start"/"result" events into the other, and the other's cleanup
 * effects can `stop()`/`abort()` a session it didn't start.
 *
 * This module is the single source of truth for "who owns the mic right
 * now". Callers must `acquireVoiceOwner` before starting a session and gate
 * every event handler + `stop()`/`abort()` call on still owning it.
 */
export type VoiceOwnerId = "hub" | "atlas-chat";

let currentOwner: VoiceOwnerId | null = null;

/** Claims ownership. Returns false (no-op) if another owner already holds it. */
export function acquireVoiceOwner(id: VoiceOwnerId): boolean {
  if (currentOwner !== null && currentOwner !== id) return false;
  currentOwner = id;
  return true;
}

/** Releases ownership if `id` currently holds it; otherwise a no-op. */
export function releaseVoiceOwner(id: VoiceOwnerId): void {
  if (currentOwner === id) currentOwner = null;
}

export function isVoiceOwner(id: VoiceOwnerId): boolean {
  return currentOwner === id;
}
