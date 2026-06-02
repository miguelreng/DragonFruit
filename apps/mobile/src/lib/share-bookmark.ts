import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";

import { API_URL } from "@/lib/config";
import { getBookmarkExtensionContext, getWorkspaces } from "@/lib/api";
import { getToken } from "@/lib/secure-store";

// Feeds the iOS Share Extension (targets/share/index.swift). The extension is a
// separate process, so it can't read our keychain or call our JS — instead the
// app drops everything it needs into the shared App Group and the Swift side
// reads it back with UserDefaults(suiteName:). Keep these as PLAIN STRINGS so
// the extension can read them with `.string(forKey:)`.
//
// Must match app.config.js `ios.entitlements`, targets/share/expo-target.config.js,
// and the constants in targets/share/index.swift.
const APP_GROUP = "group.sh.dragonfruit.mobile";

const KEYS = {
  apiBaseUrl: "share_api_base_url",
  token: "share_api_token",
  workspaceSlug: "share_workspace_slug",
  projectId: "share_default_project_id",
} as const;

// Like the widget, the share extension needs an App Group, which requires a paid
// Apple Developer account. Free / Personal-Team builds leave it off so signing
// won't fail. Flip EXPO_PUBLIC_SHARE_ENABLED=1 (and rebuild) once on the paid
// program. Must match the gate in app.config.js.
const SHARE_ENABLED = process.env.EXPO_PUBLIC_SHARE_ENABLED === "1";

const storage = Platform.OS === "ios" && SHARE_ENABLED ? new ExtensionStorage(APP_GROUP) : null;

/**
 * Push the current credentials + target into the App Group so a shared link can
 * be saved as a bookmark without launching the app. We target the user's first
 * workspace and its default project — the same workspace the app drops you into
 * on launch (see app/(app)/(home)/index.tsx). Best-effort and silent; if we
 * can't resolve everything we clear, so the extension never posts with stale data.
 */
export async function syncShareBookmarkConfig(): Promise<void> {
  if (!storage) return;
  try {
    const token = await getToken();
    if (!token) {
      clearShareBookmarkConfig();
      return;
    }
    const workspaces = await getWorkspaces();
    const slug = workspaces[0]?.slug;
    if (!slug) {
      clearShareBookmarkConfig();
      return;
    }
    const context = await getBookmarkExtensionContext(slug);
    if (!context.default_project_id) {
      clearShareBookmarkConfig();
      return;
    }
    storage.set(KEYS.apiBaseUrl, API_URL);
    storage.set(KEYS.token, token);
    storage.set(KEYS.workspaceSlug, context.workspace_slug || slug);
    storage.set(KEYS.projectId, context.default_project_id);
  } catch {
    // Never let share-config sync surface an error in the app.
  }
}

/** Wipe credentials on sign-out so a shared link can't post as the old user. */
export function clearShareBookmarkConfig(): void {
  if (!storage) return;
  storage.remove(KEYS.apiBaseUrl);
  storage.remove(KEYS.token);
  storage.remove(KEYS.workspaceSlug);
  storage.remove(KEYS.projectId);
}
